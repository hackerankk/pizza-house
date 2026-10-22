<?php
declare(strict_types=1);
$source=file_get_contents(__DIR__ . '/../public/index.php');
$boundary=strpos($source,'$method = $_SERVER');
eval(substr($source,5,$boundary-5));
restore_exception_handler();
if(env('APP_ENV')!=='local'||!in_array(env('DB_HOST'),['127.0.0.1','localhost'],true))throw new RuntimeException('Local test database required');
function security_check(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS: $label\n";}
function rejects_schema(mixed $value,array $schema,string $label):void{try{security_validate($value,$schema);throw new RuntimeException('Accepted invalid input: '.$label);}catch(RequestValidationException $e){echo "PASS: $label\n";}}
$schema=security_request_schema('/auth/login','POST');
security_validate((object)['email'=>'test@example.com','password'=>'Strong test password'],$schema);
rejects_schema((object)['email'=>['$ne'=>''],'password'=>'test'],$schema,'Reject object email instead of string');
rejects_schema((object)['email'=>'a@example.com','password'=>true],$schema,'Reject boolean password coercion');
rejects_schema((object)['email'=>'a@example.com','password'=>str_repeat('x',73)],$schema,'Bound password length before hashing');
rejects_schema((object)['email'=>'a@example.com','password'=>'test','role'=>'admin'],$schema,'Reject unknown authentication fields');
rejects_schema((object)['email'=>'not-an-email','password'=>'test'],$schema,'Reject invalid email format');
$order=security_request_schema('/cart/validate','POST');
rejects_schema(json_decode('{"items":[{"id":1,"quantity":true}]}'),$order,'Reject boolean item quantity');
rejects_schema(json_decode('{"items":[{"id":1,"quantity":1,"option_ids":[{}]}]}'),$order,'Reject nested option ID objects');
rejects_schema(json_decode('{"items":[{"id":1,"quantity":1,"is_bogo_free":"false"}]}'),$order,'Reject string BOGO flags');
rejects_schema(json_decode('{"items":[{"id":1,"quantity":1}],"latitude":"91"}'),$order,'Reject coordinates outside range');
rejects_schema((object)['name'=>'Test','size_prices'=>(object)['XL'=>20]],security_object(security_resource_schema('products')),'Reject unknown pizza sizes');
rejects_schema((object)['size_rules'=>'{"default":{"L":["S"]}}'],security_object(security_resource_schema('offers')),'Reject malformed nested offer JSON');
rejects_schema('2026-02-30',['type'=>'date','max'=>10],'Reject impossible calendar dates');
rejects_schema('2026-10-20T12:00:00+99:99',['type'=>'datetime','max'=>35],'Reject invalid timezone offsets');
security_validate((object)['guest_access_token'=>str_repeat('a',64)],security_request_schema('/orders/1/email-invoice','POST'));
rejects_schema((object)['guest_access_token'=>'invalid'],security_request_schema('/orders/1/email-invoice','POST'),'Reject malformed guest invoice token');
$private=sanitized_settings(['restaurant_name'=>'Test','razorpay_key_secret'=>'private','smtp_password'=>'private','google_maps_api_key'=>'private']);
security_check($private===['restaurant_name'=>'Test'],'Settings deny unlisted and private values');
$originalCookies = $_COOKIE;
$_COOKIE[admin_refresh_cookie_name()] = str_repeat('a', 96);
security_validate_request('/admin/settings', 'GET', []);
security_check(true, 'Existing 96-character admin refresh cookie remains compatible');
foreach ([str_repeat('a', 64), ['invalid'], str_repeat('z', 96)] as $invalidCookie) {
    $_COOKIE[admin_refresh_cookie_name()] = $invalidCookie;
    try {
        security_validate_request('/admin/settings', 'GET', []);
        throw new RuntimeException('Invalid refresh cookie accepted');
    } catch (RequestValidationException $error) {
        security_check($error->field === 'refresh_cookie', 'Malformed refresh cookie rejected without a PHP type error');
    }
}
$_COOKIE = $originalCookies;
$original=$_SERVER;$_SERVER['REMOTE_ADDR']='127.0.0.42';$_SERVER['HTTP_X_FORWARDED_FOR']='203.0.113.9';
putenv('RATE_LIMIT_TRUSTED_PROXIES=');security_check(security_peer_ip()==='127.0.0.42','Untrusted forwarded IP cannot bypass limits');
putenv('RATE_LIMIT_TRUSTED_PROXIES=127.0.0.42');security_check(security_peer_ip()==='203.0.113.9','Explicit trusted proxy resolves client IP');$_SERVER=$original;putenv('RATE_LIMIT_TRUSTED_PROXIES=');
$prefix='security-test-'.bin2hex(random_bytes(8));$now=time();$keys=[];
try{
    $key=security_rate_key('test-public',$prefix);$keys[]=$key;
    security_check(security_rate_bucket('test-public',$prefix,2,20,false,$now)===0,'First public request allowed');
    security_rate_bucket('test-public',$prefix,2,20,false,$now);
    security_check(security_rate_bucket('test-public',$prefix,2,20,false,$now)===20,'Public window enforced atomically');
    $keys[]=security_rate_key('test-auth',$prefix);
    security_rate_bucket('test-auth',$prefix,2,60,true,$now);security_rate_bucket('test-auth',$prefix,2,60,true,$now);
    $first=security_rate_bucket('test-auth',$prefix,2,60,true,$now);
    security_check($first===security_backoff(1),'Authentication burst enters exponential backoff');
    security_check(security_rate_bucket('test-auth',$prefix,2,60,true,$now+1)===$first-1,'Blocked retries do not extend backoff');
    security_check(security_rate_bucket('test-auth',$prefix,2,60,true,$now+$first)===security_backoff(2),'Repeated permitted attempts increase backoff');
    security_check(security_rate_bucket('test-auth',$prefix,2,60,true,$now+1000)===0,'Authentication recovers without a permanent lockout');
    $email=$prefix.'@example.com';$ip='security-test-ip-'.$prefix;
    foreach(['auth-account'=>$email,'auth-ip'=>$ip]as$scope=>$identity){$keys[]=security_rate_key($scope,$identity);security_rate_bucket($scope,$identity,100,60,true);}
    $GLOBALS['security_auth_buckets']=['auth-account'=>$email,'auth-ip'=>$ip];
    for($i=0;$i<security_config('RATE_LIMIT_AUTH_ACCOUNT_FAILURES',3);$i++)security_auth_result(401);
    $select=db()->prepare('SELECT * FROM request_rate_limits WHERE bucket_key=?');$select->execute([security_rate_key('auth-account',$email)]);$failed=$select->fetch();
    security_check((int)$failed['next_allowed']>=$now+security_backoff(1),'Failed logins apply account backoff');
    security_auth_result(200);$select->execute([security_rate_key('auth-account',$email)]);$success=$select->fetch();
    security_check((int)$success['failures']===0&&(int)$success['next_allowed']===0,'Successful authentication clears account penalties');
    unset($GLOBALS['security_auth_buckets']);
    $temp=tempnam(sys_get_temp_dir(),'tph-image-');$clean=$temp.'.png';$image=imagecreatetruecolor(2,2);imagepng($image,$temp);imagedestroy($image);
    file_put_contents($temp,'<?php echo "embedded"; ?>',FILE_APPEND);security_store_image($temp,$clean,'image/png');
    security_check(!str_contains(file_get_contents($clean),'<?php'),'Image re-encoding removes appended executable content');unlink($temp);unlink($clean);
    $wav=tempnam(sys_get_temp_dir(),'tph-audio-');$pcm=str_repeat("\0",160);
    file_put_contents($wav,'RIFF'.pack('V',36+strlen($pcm)).'WAVEfmt '.pack('VvvVVvv',16,1,1,8000,16000,2,16).'data'.pack('V',strlen($pcm)).$pcm);
    security_check(security_audio_content_valid($wav,'wav'),'Valid WAV container accepted');
    file_put_contents($wav,'<html>not audio</html>');security_check(!security_audio_content_valid($wav,'wav'),'Spoofed audio content rejected');unlink($wav);
}finally{
    unset($GLOBALS['security_auth_buckets']);
    $delete=db()->prepare('DELETE FROM request_rate_limits WHERE bucket_key=?');foreach($keys as$key)$delete->execute([$key]);
}
