var points, vertices, colors;
var gl;
var viewAngle = 45;
var lineWidth = 1.0;
var length = 1.0;
var defaultxoffset = 0.0, defaultyoffset = 0.0, defaultzoffset = -5.0;
var defaultpointSize = 1;
var pointSize, maxPointSize = 7, minPointSize = 1;
var xoffset, yoffset, zoffset;
var rotateStep = 5, shiftStep = 0.3;
var coordsLen = 5.0;
var mouseRotateScale = 5, mouseShiftScale = 70;
var mouseDown = false, showCoordinateSystem = false;
var lastMouseX, lastMouseY;
var currentlyPressedKeys = {};

var shaderProgram;
var cloudVertexPositionBuffer;
var cloudVertexColorBuffer;
var coordinateSystemVerticesBuffer;
var coordinateSystemColorBuffer;
var rotationMatrix = mat4.create();
var mvMatrix = mat4.create();
var mvMatrixStack = [];
var pMatrix = mat4.create();

mat4.identity(rotationMatrix);
var keyCodes = {"PLUS": 107, "MINUS": 109, "CTRL": 17, "SHIFT": 16, "ALT": 18, "UP": 38, "DOWN": 40, "LEFT": 37, "RIGHT":39, "ESC":27, "H":72};
  
function getParam(sname)
{
  var params = location.search.substr(location.search.indexOf("?")+1);
  var sval = "";
  params = params.split("&");
    // split param and value into individual pieces
  for (var i=0; i<params.length; i++)
  {
    temp = params[i].split("=");
    if ( [temp[0]] == sname ) { sval = temp[1]; }
  }
  return sval;
}

function isHeader(line)
{
  var tags = ["#", "VERSION", "FIELDS", "SIZE", "TYPE", "COUNT", "WIDTH", "HEIGHT", "VIEWPOINT", "POINTS", "DATA"];
  for(var i=0;i<tags.length;i++)
  {
    if(line.substring(0, tags[i].length)==tags[i])
    {
      return true;
    }
  }
  return false;
}

function parsePCD(file)
{
  var json = {"points":0, "vertices":[], "colors":[]};
  var lines = file.split("\n");
  var buf = new ArrayBuffer(4);
  var f32 = new Float32Array(buf);
  var i8 = new Uint8Array(buf);
  for(var i=0;i<lines.length;i++)
  {
    var line = $.trim(lines[i]);
    if(!isHeader(line))
    {
      var values = line.split(" ");
      json.points++;
      json.vertices.push(parseFloat(values[0]), parseFloat(values[1]), parseFloat(values[2]));
      var rgb = parseFloat(values[3]);
      f32[0] = rgb;
      json.colors.push(i8[2]/255.0, i8[1]/255.0, i8[0]/255.0, 1.0);
    }
  }
  return json;
}

function initCloud(file)
{
  var data = parsePCD(file);
  points = data.points;
  vertices = data.vertices;
  colors = data.colors;
}

function initParams()
{
  mat4.identity(rotationMatrix);
  mat4.identity(mvMatrix);
  mvMatrixStack = [];
  xoffset = defaultxoffset;
  yoffset = defaultyoffset;
  zoffset = defaultzoffset;
  pointSize = defaultpointSize;
}

function initAll()
{
  initParams();
  initCanvas();
  initializeScene();
}

function loadURL(fileName)
{
  var url = "loadCloud.php?load="+fileName;
  $.ajax({
  url: url,
  dataType: "text",
  timeout: 10000,
  async: false,
  error: function(jqXHR, textStatus)
	  {
	      alert(textStatus);
	  }
  }).done(
      function(file)
      {
	  initCloud(file);
      }
  );
}

function updateURL()
{
  fileName = document.getElementById("fileNameTextField").value;
//   alert(fileName);
  webGLStart();
}

function initGL(canvas) {
    try {
	gl = canvas.getContext("experimental-webgl");
	gl.viewportWidth = canvas.width;
	gl.viewportHeight = canvas.height;
    } catch (e) {
    }
    if (!gl) {
	alert("Could not initialise WebGL, sorry :-(");
    }
}


function getShader(gl, id) {
    var shaderScript = document.getElementById(id);
    if (!shaderScript) {
	return null;
    }

    var str = "";
    var k = shaderScript.firstChild;
    while (k) {
	if (k.nodeType == 3) {
	    str += k.textContent;
	}
	k = k.nextSibling;
    }

    var shader;
    if (shaderScript.type == "x-shader/x-fragment") {
	shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
	shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
	return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
	alert(gl.getShaderInfoLog(shader));
	return null;
    }

    return shader;
}

function initShaders() {
    var fragmentShader = getShader(gl, "shader-fs");
    var vertexShader = getShader(gl, "shader-vs");

    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
	alert("Could not initialise shaders");
    }

    gl.useProgram(shaderProgram);

    shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

    shaderProgram.vertexColorAttribute = gl.getAttribLocation(shaderProgram, "aVertexColor");
    gl.enableVertexAttribArray(shaderProgram.vertexColorAttribute);

    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    shaderProgram.pointSizeUniform = gl.getUniformLocation(shaderProgram, "uPointSize");
}

function mvPushMatrix() {
    var copy = mat4.create();
    mat4.set(mvMatrix, copy);
    mvMatrixStack.push(copy);
}

function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
	throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}


function setMatrixUniforms() {
    gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
    gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
    gl.uniform1f(shaderProgram.pointSizeUniform, pointSize);
}


function degToRad(degrees) {
    return degrees * Math.PI / 180;
}

function initBuffers() {
    cloudVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    cloudVertexPositionBuffer.itemSize = 3;
    cloudVertexPositionBuffer.numItems = points;

    cloudVertexColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    cloudVertexColorBuffer.itemSize = 4;
    cloudVertexColorBuffer.numItems = points;

    var coordinateSystemVertices = [0.0, 0.0, 0.0,
				    length, 0.0, 0.0,
				    0.0, 0.0, 0.0,
				    0.0, length, 0.0,
				    0.0, 0.0, 0.0,
				    0.0, 0.0, length];

    var coordinateSystemColors = [1.0, 0.0, 0.0, 1.0,
				  1.0, 0.0, 0.0, 1.0,
				  0.0, 1.0, 0.0, 1.0,
				  0.0, 1.0, 0.0, 1.0,
				  0.0, 0.0, 1.0, 1.0,
				  0.0, 0.0, 1.0, 1.0];

    coordinateSystemVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, coordinateSystemVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coordinateSystemVertices), gl.STATIC_DRAW);
    coordinateSystemVerticesBuffer.itemSize = 3;
    coordinateSystemVerticesBuffer.numItems = 6;

    coordinateSystemColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, coordinateSystemColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coordinateSystemColors), gl.STATIC_DRAW);
    coordinateSystemColorBuffer.itemSize = 4;
    coordinateSystemColorBuffer.numItems = 6;
}

function drawCoordinateSystem() {
    gl.bindBuffer(gl.ARRAY_BUFFER, coordinateSystemVerticesBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, coordinateSystemVerticesBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, coordinateSystemColorBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexColorAttribute, coordinateSystemColorBuffer.itemSize, gl.FLOAT, false, 0, 0);

    setMatrixUniforms();
    gl.lineWidth(lineWidth);
    gl.drawArrays(gl.LINES, 0, coordinateSystemVerticesBuffer.numItems);
}

function drawScene() {
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexPositionBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, cloudVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexColorBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexColorAttribute, cloudVertexColorBuffer.itemSize, gl.FLOAT, false, 0, 0);

    setMatrixUniforms();
    gl.drawArrays(gl.POINTS, 0, cloudVertexPositionBuffer.numItems);
    
    if(showCoordinateSystem==true)
    {
      drawCoordinateSystem();
    }
}

function initializeScene() {
    mat4.perspective(viewAngle, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);
    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [xoffset, yoffset, zoffset]);
    drawScene();
}

function initCanvas() {
    var canvas = document.getElementById("cloudCanvas");
    canvas.style.width = window.innerWidth;
    canvas.style.height = window.innerHeight;
    canvas.addEventListener('DOMMouseScroll', handleScroll, false); // Firefox
    document.onmousewheel = handleScroll; // IE/Opera
    initGL(canvas);
    initShaders()
    initBuffers();
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    canvas.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;
}

function handleMouseDown(event) {
    mouseDown = true;
    showCoordinateSystem = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
}

function handleMouseUp(event) {
    mouseDown = false;
    showCoordinateSystem = false;
    drawScene();
}

function handleMouseMove(event) {
    if (!mouseDown) {
	return;
    }
    var newX = event.clientX;
    var newY = event.clientY;

    var deltaX = newX - lastMouseX
    var deltaY = newY - lastMouseY;
    
    var newRotationMatrix = mat4.create();
    mat4.identity(newRotationMatrix);
    
    if(currentlyPressedKeys[keyCodes.CTRL]) // CONTROL
    {
	mat4.rotate(newRotationMatrix, degToRad((deltaY + deltaX) / (2*mouseRotateScale)), [0, 0, -1]);
	mat4.multiply(newRotationMatrix, rotationMatrix, rotationMatrix);
    }
    else if(currentlyPressedKeys[keyCodes.SHIFT]) // SHIFT
    {
	xoffset+=deltaX/mouseShiftScale;
	yoffset-=deltaY/mouseShiftScale;
    }
    else
    {
	mat4.rotate(newRotationMatrix, degToRad(deltaX / mouseRotateScale), [0, 1, 0]);
	mat4.rotate(newRotationMatrix, degToRad(deltaY / mouseRotateScale), [1, 0, 0]);
	mat4.multiply(newRotationMatrix, rotationMatrix, rotationMatrix);
    }

    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [xoffset, yoffset, zoffset]);
    mat4.multiply(mvMatrix, rotationMatrix);

    lastMouseX = newX
    lastMouseY = newY;
    drawScene();
}

function rotate(axisX, axisY, axisZ, angle)
{
    var tempMat = mat4.create();
    mat4.identity(tempMat);
    mat4.rotate(tempMat, degToRad(angle), [axisX, axisY, axisZ]);
    mat4.multiply(tempMat, rotationMatrix, rotationMatrix); 
    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [xoffset, yoffset, zoffset]);
    mat4.multiply(mvMatrix, rotationMatrix);
    drawScene();
}

function rotateX()
{
    rotateStep = document.getElementById("rotateStep").value;
    if(rotateStep=="")
    {
      return;
    }
    rotate(1,0,0,rotateStep);
}

function rotateY()
{
    rotateStep = document.getElementById("rotateStep").value;
    if(rotateStep=="")
    {
      return;
    }
    rotate(0,1,0,rotateStep);
}

function rotateZ()
{
    rotateStep = document.getElementById("rotateStep").value;
    if(rotateStep=="")
    {
      return;
    }
    rotate(0,0,1,rotateStep);
}

function shift(x, y, z)
{
    xoffset = xoffset+parseFloat(x);
    yoffset = yoffset+parseFloat(y);
    zoffset = zoffset+parseFloat(z);
    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [xoffset, yoffset, zoffset]);
    mat4.multiply(mvMatrix, rotationMatrix);
    drawScene();
}

function shiftX()
{
    shiftStep = document.getElementById("shiftStep").value;
    if(shiftStep=="")
    {
      return;
    }
    shift(shiftStep,0,0);
}

function shiftY()
{
    shiftStep = document.getElementById("shiftStep").value;
    if(shiftStep=="")
    {
      return;
    }
    shift(0,shiftStep,0);
}

function shiftZ()
{
    shiftStep = document.getElementById("shiftStep").value;
    if(shiftStep=="")
    {
      return;
    }
    shift(0,0,shiftStep);
}

function handleScroll(event)
{
    var delta = 0;

    if (!event) event = window.event;

    // normalize the delta
    if (event.wheelDelta) {

	// IE and Opera
	delta = event.wheelDelta / 60;

    } else if (event.detail) {

	// W3C
	delta = -event.detail / 3;
    }

    shift(0,0,delta);
}

function handleKeyDown(event) {
    currentlyPressedKeys[event.keyCode] = true;
    if(event.keyCode==keyCodes.PLUS) // PLUS key
    {
	pointSize+=1;
	if(pointSize>maxPointSize)
	{
	    pointSize = maxPointSize;
	}
	else
	{
	    drawScene();
	}
    }
    else if(event.keyCode==keyCodes.MINUS) // MINUS key
    {
	pointSize-=1;
	if(pointSize<minPointSize)
	{
	    pointSize = minPointSize;
	}
	else
	{
	    drawScene();
	}
    }
    else if(event.keyCode==keyCodes.UP)
    {
      if(currentlyPressedKeys[keyCodes.SHIFT]==true)
      {
	shift(0, shiftStep, 0);
      }
      else if(currentlyPressedKeys[keyCodes.CTRL]==true)
      {
	shift(0, 0, shiftStep);
      }
      else
      {
	rotate(1, 0, 0, -rotateStep);
      }
    }
    else if(event.keyCode==keyCodes.DOWN)
    {
      if(currentlyPressedKeys[keyCodes.SHIFT]==true)
      {
	shift(0, -shiftStep, 0);
      }
      else if(currentlyPressedKeys[keyCodes.CTRL]==true)
      {
	shift(0, 0, -shiftStep);
      }
      else
      {
	rotate(1, 0, 0, rotateStep);
      }
    }
    else if(event.keyCode==keyCodes.LEFT)
    {
      if(currentlyPressedKeys[keyCodes.SHIFT]==true)
      {
	shift(-shiftStep, 0, 0);
      }
      else if(currentlyPressedKeys[keyCodes.CTRL]==true)
      {
	rotate(0, 0, 1, -rotateStep);
      }
      else
      {
	rotate(0, 1, 0, rotateStep);
      }
    }
    else if(event.keyCode==keyCodes.RIGHT)
    {
      if(currentlyPressedKeys[keyCodes.SHIFT]==true)
      {
	shift(shiftStep, 0, 0);
      }
      else if(currentlyPressedKeys[keyCodes.CTRL]==true)
      {
	rotate(0, 0, 1, rotateStep);
      }
      else
      {
	rotate(0, 1, 0, -rotateStep);
      }
    }
    else if(event.keyCode==keyCodes.ESC)
    {
      $("#help").slideUp();
    }
    else if(event.keyCode==keyCodes.H)
    {
      $("#help").slideToggle();
    }
}

function handleKeyUp(event) {
    currentlyPressedKeys[event.keyCode] = false;
}

function webGLStart() {
    loadURL(fileName);
    initAll();
}

function loadLocalFile()
{
  var length = document.getElementById("uploadField").files.length;
  for(var i=0;i<length;i++)
  {
    var file = document.getElementById("uploadField").files[0];
    var reader = new FileReader();

    reader.onload = (function(file) {
			initCloud(file.target.result);
			initAll();
		      });

    reader.readAsText(file);
  }
}