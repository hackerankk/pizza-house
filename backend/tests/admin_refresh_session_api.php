<?php
declare(strict_types=1);
// Explicit loopback-only API and disposable test credentials are required.
$base = getenv('PIZZA_TEST_BASE_URL') ?: '';
if (!preg_match('#^http://(127\.0\.0\.1|localhost):[0-9]+$#D', $base)) throw new RuntimeException('Explicit loopback API required');
$ch = curl_init();
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>15]);
function request_session(string $path, string $method, ?array $body = null, string $token = ''): array {
    global $ch, $base;
    $headers = $token ? ['Authorization: Bearer '.$token] : [];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch,[CURLOPT_URL=>$base.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,CURLOPT_POSTFIELDS=>$body===null ? null : json_encode((object)$body)]);
    $raw=curl_exec($ch);
    if ($raw === false) throw new RuntimeException('Local session request failed');
    return ['status'=>curl_getinfo($ch,CURLINFO_HTTP_CODE),'data'=>json_decode($raw,true)];
}
function assert_session(bool $ok,string $message): void { if (!$ok) throw new RuntimeException($message); echo 'PASS: '.$message.PHP_EOL; }
try {
    $login=request_session('/auth/admin-login','POST',['email'=>getenv('PIZZA_TEST_ADMIN_EMAIL'),'password'=>getenv('PIZZA_TEST_ADMIN_PASSWORD')]);
    assert_session($login['status']===200,'Admin login succeeds and sets refresh session');
    $cookies=curl_getinfo($ch,CURLINFO_COOKIELIST);
    $refresh=array_values(array_filter($cookies,fn($cookie)=>str_contains($cookie,"\tpizza_house_admin_refresh\t")));
    assert_session(count($refresh)===1 && strlen(explode("\t",$refresh[0])[6])===96,'Issued refresh cookie retains existing 96-character contract');
    $settings=request_session('/admin/settings','GET',null,$login['data']['token']);
    assert_session($settings['status']===200,'Authenticated admin action accepts the actual browser refresh cookie');
    $renew=request_session('/auth/admin-refresh','POST',[]);
    assert_session($renew['status']===200 && !empty($renew['data']['token']),'Cookie refresh rotates the authenticated session');
    assert_session(request_session('/admin/settings','GET',null,$renew['data']['token'])['status']===200,'Rotated session remains usable');
    assert_session(request_session('/auth/admin-logout','POST',[],$renew['data']['token'])['status']===200,'Admin logout succeeds with refresh cookie');
    assert_session(request_session('/auth/admin-refresh','POST',[])['status']===401,'Logged-out session cannot refresh');
} finally { curl_close($ch); }
