<?php
function url_exists($url) {
    if (!$fp = curl_init($url)) return false;
    return true;
}
$url = "";
if(array_key_exists("load", $_GET))
{
  $url = $_GET["load"];
}
else
{
  return;
}
// $file = fopen($url, "r") or exit("Unable to open file ".$url);
$source = array(' ');
$target = array('%20');
$url = str_replace($source, $target, $url);
$data = @file_get_contents(htmlentities($url));
if($data)
  echo $data;
// else
//   echo "File not found";
?>