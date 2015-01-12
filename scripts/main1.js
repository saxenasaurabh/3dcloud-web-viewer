
var gl;
var viewAngle = 45;
var lineWidth = 1.0;
var length = 1.0;
var pointSize = 1, maxPointSize = 7, minPointSize = 1;
var xoffset = 0.0, yoffset = 0.0, zoffset = -5.0;
var rotateStep = 5, shiftStep = 0.3;
var coordsLen = 5.0;
var mouseRotateScale = 5, mouseShiftScale = 70;
var mouseDown = false, showCoordinateSystem = false;
var lastMouseX, lastMouseY;
var rotationMatrix = mat4.create();
var maxBufferSize = 10000;
mat4.identity(rotationMatrix);
var keyCodes = {"PLUS": 107, "MINUS": 109, "CTRL": 17, "SHIFT": 16, "ALT": 18, "UP": 38, "DOWN": 40, "LEFT": 37, "RIGHT":39};

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


var shaderProgram;

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


var mvMatrix = mat4.create();
var mvMatrixStack = [];
var pMatrix = mat4.create();

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


var cloudVertexPositionBuffer = [];
var cloudVertexColorBuffer = [];
var coordinateSystemVerticesBuffer;
var coordinateSystemColorBuffer;

function initBuffers() {
    var cur = 0, start = 0, end; 
    while(start<points)
    {
      end = Math.min(start+maxBufferSize,  points);
      cloudVertexPositionBuffer[cur] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexPositionBuffer[cur]);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices.slice(3*start, 3*end)), gl.STATIC_DRAW);
      cloudVertexPositionBuffer[cur].itemSize = 3;
      cloudVertexPositionBuffer[cur].numItems = end-start;

      cloudVertexColorBuffer[cur] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexColorBuffer[cur]);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors.slice(4*start, 4*end)), gl.STATIC_DRAW);
      cloudVertexColorBuffer[cur].itemSize = 4;
      cloudVertexColorBuffer[cur].numItems = end-start;
      start+=maxBufferSize;
      cur++;
    }

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
    
    for(var i=0;i<cloudVertexPositionBuffer.length;i++)
    {
      gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexPositionBuffer[i]);
      gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, cloudVertexPositionBuffer[i].itemSize, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, cloudVertexColorBuffer[i]);
      gl.vertexAttribPointer(shaderProgram.vertexColorAttribute, cloudVertexColorBuffer[i].itemSize, gl.FLOAT, false, 0, 0);

      setMatrixUniforms();
      gl.drawArrays(gl.POINTS, 0, cloudVertexPositionBuffer[i].numItems);
    }
    
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

var currentlyPressedKeys = {};

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
}

function handleKeyUp(event) {
    currentlyPressedKeys[event.keyCode] = false;
}

function webGLStart() {
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
    initializeScene();
}