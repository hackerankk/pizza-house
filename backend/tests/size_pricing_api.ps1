param([string]$BaseUrl = 'http://127.0.0.1:8000')
$ErrorActionPreference = 'Stop'
if ($BaseUrl -notmatch '^http://(127\.0\.0\.1|localhost):\d+$') { throw 'Local API required' }
if (!$env:PIZZA_TEST_ADMIN_EMAIL -or !$env:PIZZA_TEST_ADMIN_PASSWORD) { throw 'Set PIZZA_TEST_ADMIN_EMAIL and PIZZA_TEST_ADMIN_PASSWORD for the existing local admin' }
$login = Invoke-RestMethod "$BaseUrl/auth/admin-login" -Method Post -ContentType 'application/json' -Body (@{email=$env:PIZZA_TEST_ADMIN_EMAIL;password=$env:PIZZA_TEST_ADMIN_PASSWORD} | ConvertTo-Json) -SessionVariable testSession -TimeoutSec 20
$headers = @{Authorization="Bearer $($login.token)"}
$created = @()
function Request($path, $method, $body) {
    Invoke-RestMethod "$BaseUrl$path" -Method $method -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 20
}
try {
    $menu = Invoke-RestMethod "$BaseUrl/menu" -TimeoutSec 20
    foreach ($prices in @(@{S=149;M=259;L=349}, @{M=319;L=459})) {
        $name = 'Size API test ' + [guid]::NewGuid().ToString('N')
        $result = Request '/admin/products' 'Post' @{name=$name;category_id=$menu.categories[0].id;price=1;stock=100;is_active=1;size_prices=$prices}
        $created += $result.id
        $item = (Invoke-RestMethod "$BaseUrl/menu" -TimeoutSec 20).items | Where-Object id -eq $result.id
        if ($item.variants.Count -ne $prices.Count) { throw 'Incorrect variant count' }
        foreach ($v in $item.variants) { if ([decimal]$v.price -ne $prices[$v.name]) { throw 'Incorrect saved size price' } }
        Write-Output 'PASS: authenticated create and public menu size prices'
        $medium = $item.variants | Where-Object name -eq 'M'
        $calc = Request '/cart/validate' 'Post' @{order_type='takeaway';items=@(@{id=$item.id;variant_id=$medium.id;quantity=10;price=0.01})}
        if ([decimal]$calc.subtotal -ne 10 * $prices.M) { throw 'Incorrect server cart total' }
        Write-Output 'PASS: API ignores forged price and uses selected size'
        $null = Request "/admin/products/$($item.id)" 'Put' @{name=$name;size_prices=@{M=329;L=469}}
        $edited = (Invoke-RestMethod "$BaseUrl/menu" -TimeoutSec 20).items | Where-Object id -eq $item.id
        $editedMedium = $edited.variants | Where-Object name -eq 'M'
        if ($edited.variants.Count -ne 2 -or $editedMedium.id -ne $medium.id -or [decimal]$editedMedium.price -ne 329) { throw 'Edit failed' }
        Write-Output 'PASS: edit prices, disable Small, preserve Medium ID'
        try {
            $null = Request "/admin/products/$($item.id)" 'Put' @{name=$name;size_prices=@{S=-1}}
            throw 'Invalid price accepted'
        } catch {
            if ([int]$_.Exception.Response.StatusCode -ne 422) { throw }
            Write-Output 'PASS: negative size price rejected with HTTP 422'
        }
    }
} finally {
    foreach ($id in $created) {
        $null = Invoke-RestMethod "$BaseUrl/admin/products/$id" -Method Delete -Headers $headers -TimeoutSec 20
    }
    Write-Output 'Removed only the products created by this test.'
    $null = Invoke-RestMethod "$BaseUrl/auth/admin-logout" -Method Post -Headers $headers -WebSession $testSession -TimeoutSec 20
}
