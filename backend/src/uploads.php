<?php
declare(strict_types=1);

function private_upload_root(): string {
    $root = env('UPLOAD_STORAGE_PATH','') ?: dirname(__DIR__) . '/storage';
    if (!is_dir($root) && !mkdir($root,0750,true) && !is_dir($root)) throw new RuntimeException('Upload storage unavailable');
    $resolved=realpath($root);
    $webRoot=realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__) . '/public');
    if (!$resolved || ($webRoot && (strtolower($resolved)===strtolower($webRoot) || str_starts_with(strtolower($resolved),strtolower($webRoot) . DIRECTORY_SEPARATOR)))) throw new RuntimeException('Upload storage must be outside the document root');
    return $resolved;
}

function secure_upload_relative(string $path): bool {
    return (bool)preg_match('#^uploads/(products|categories|promotions|notifications)/[a-zA-Z0-9_-]+\.(jpg|png|webp|mp3|wav|ogg)$#D',$path);
}

function security_store_image(string $source,string $target,string $mime): void {
    $size=@getimagesize($source);
    if (!$size || $size[0]<1 || $size[1]<1 || $size[0]*$size[1]>security_config('UPLOAD_MAX_IMAGE_PIXELS',16000000)) json_response(['error'=>'Image dimensions are invalid or too large'],422);
    $decoder=match($mime){'image/jpeg'=>'imagecreatefromjpeg','image/png'=>'imagecreatefrompng','image/webp'=>'imagecreatefromwebp',default=>''};
    if (!$decoder || !function_exists($decoder)) throw new RuntimeException('Enable GD with JPEG, PNG and WebP support for uploads');
    $image=@$decoder($source);
    if (!$image) json_response(['error'=>'Image content could not be decoded'],422);
    imagealphablending($image,false); imagesavealpha($image,true);
    // Decode and re-encode: strip metadata, PHP/HTML payloads and appended data.
    $ok=match($mime){'image/jpeg'=>imagejpeg($image,$target,90),'image/png'=>imagepng($image,$target),'image/webp'=>imagewebp($image,$target,90)};
    imagedestroy($image);
    if (!$ok) throw new RuntimeException('Could not encode uploaded image');
}

function security_audio_content_valid(string $path,string $format): bool {
    $bytes=file_get_contents($path); if($bytes===false)return false; $length=strlen($bytes);
    if ($format==='wav') {
        if ($length<44 || substr($bytes,0,4)!=='RIFF' || substr($bytes,8,4)!=='WAVE' || unpack('V',substr($bytes,4,4))[1]+8!==$length) return false;
        $fmt=false; $data=false;
        for($offset=12;$offset+8<=$length;){
            $tag=substr($bytes,$offset,4);$size=unpack('V',substr($bytes,$offset+4,4))[1];$offset+=8;
            if($size>$length-$offset)return false;
            if($tag==='fmt ' && $size>=16){$header=unpack('vformat/vchannels/Vrate',substr($bytes,$offset,8));$fmt=in_array($header['format'],[1,3,6,7,65534],true)&&$header['channels']>=1&&$header['channels']<=8&&$header['rate']>=8000&&$header['rate']<=384000;}
            if($tag==='data' && $size>0)$data=true;
            $offset+=$size+($size%2);
        }
        return $fmt&&$data;
    }
    if($format==='ogg'){
        if($length<28 || substr($bytes,0,4)!=='OggS' || ord($bytes[4])!==0)return false;
        $segments=ord($bytes[26]);if(!$segments || $length<27+$segments)return false;
        $size=array_sum(array_map('ord',str_split(substr($bytes,27,$segments))));$offset=27+$segments;
        return $size>0 && $offset+$size<=$length && (substr($bytes,$offset,8)==='OpusHead'||substr($bytes,$offset,7)==="\x01vorbis");
    }
    $offset=0;
    if(substr($bytes,0,3)==='ID3'){
        if($length<10)return false;$size=0;
        for($i=6;$i<10;$i++){if(ord($bytes[$i])>127)return false;$size=($size<<7)|ord($bytes[$i]);}
        $offset=10+$size+((ord($bytes[5])&16)?10:0);
    }
    $frames=0;
    while($offset+4<=$length && $frames<2){
        $h=array_values(unpack('C4',substr($bytes,$offset,4)));$version=($h[1]>>3)&3;$layer=($h[1]>>1)&3;$bitrate=($h[2]>>4)&15;$rate=($h[2]>>2)&3;
        if($h[0]!==255 || ($h[1]&224)!==224 || $version===1 || $layer!==1 || $bitrate===0 || $bitrate===15 || $rate===3)return false;
        $bitrates=$version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
        $frequency=[44100,48000,32000][$rate]/($version===3?1:($version===2?2:4));
        $frame=(int)floor(($version===3?144:72)*$bitrates[$bitrate]*1000/$frequency)+(($h[2]>>1)&1);
        if($frame<4 || $offset+$frame>$length)return false;$offset+=$frame;$frames++;
    }
    return $frames>=2 || ($frames===1 && $offset===$length);
}

function serve_private_upload(string $path): void {
    $relative=ltrim($path,'/');
    if(!secure_upload_relative($relative))json_response(['error'=>'Not found'],404);
    $root=private_upload_root();$file=$root . DIRECTORY_SEPARATOR . str_replace('/',DIRECTORY_SEPARATOR,$relative);$resolved=realpath($file);
    if(!$resolved || !str_starts_with($resolved,$root . DIRECTORY_SEPARATOR)||!is_file($resolved))json_response(['error'=>'Not found'],404);
    $mime=match(pathinfo($resolved,PATHINFO_EXTENSION)){'jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','mp3'=>'audio/mpeg','wav'=>'audio/wav','ogg'=>'audio/ogg'};
    header('Content-Type: ' . $mime);
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Content-Disposition: inline; filename="' . basename($resolved) . '"');
    header('Content-Length: ' . filesize($resolved));
    readfile($resolved);exit;
}
