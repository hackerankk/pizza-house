param([string]$BaseUrl = 'http://127.0.0.1:8000')
$ErrorActionPreference = 'Stop'
if ($BaseUrl -notmatch '^http://(127\.0\.0\.1|localhost):\d+$') { throw 'Local API required' }
if (!$env:PIZZA_TEST_ADMIN_EMAIL -or !$env:PIZZA_TEST_ADMIN_PASSWORD) { throw 'Set PIZZA_TEST_ADMIN_EMAIL and PIZZA_TEST_ADMIN_PASSWORD for the existing local admin' }
if (!$env:PIZZA_TEST_STAFF_EMAIL -or !$env:PIZZA_TEST_STAFF_PASSWORD) { throw 'Set PIZZA_TEST_STAFF_EMAIL and PIZZA_TEST_STAFF_PASSWORD for a local staff user with create_orders, edit_orders and apply_manual_discount permissions' }

$adminLogin = Invoke-RestMethod "$BaseUrl/auth/admin-login" -Method Post -ContentType 'application/json' -Body (@{email=$env:PIZZA_TEST_ADMIN_EMAIL;password=$env:PIZZA_TEST_ADMIN_PASSWORD} | ConvertTo-Json) -SessionVariable adminSession -TimeoutSec 20
$adminHeaders = @{Authorization="Bearer $($adminLogin.token)"}
$staffLogin = Invoke-RestMethod "$BaseUrl/auth/staff-login" -Method Post -ContentType 'application/json' -Body (@{email=$env:PIZZA_TEST_STAFF_EMAIL;password=$env:PIZZA_TEST_STAFF_PASSWORD} | ConvertTo-Json) -TimeoutSec 20
$staffHeaders = @{Authorization="Bearer $($staffLogin.token)"}

$createdProducts = @()
$createdOffers = @()

function AdminRequest($path, $method, $body) {
    Invoke-RestMethod "$BaseUrl$path" -Method $method -Headers $adminHeaders -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 20
}
function StaffRequest($path, $method, $body, $extraHeaders) {
    $headers = $staffHeaders.Clone()
    if ($extraHeaders) { foreach ($key in $extraHeaders.Keys) { $headers[$key] = $extraHeaders[$key] } }
    Invoke-RestMethod "$BaseUrl$path" -Method $method -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress) -TimeoutSec 20
}
function Fail($message) { throw "TEST FAILURE: $message" }

try {
    $menu = Invoke-RestMethod "$BaseUrl/menu" -TimeoutSec 20
    if (!$menu.items.Count -or !$menu.categories.Count) { Fail 'Menu has no items or categories' }

    # --- 1. Burger-style Normal/Premium variant pricing ---
    $burgerName = 'Variant API test ' + [guid]::NewGuid().ToString('N')
    $created = AdminRequest '/admin/products' 'Post' @{name=$burgerName;category_id=$menu.categories[0].id;price=59;stock=100;is_active=1;variant_prices=@{Normal=59;Premium=79}}
    $createdProducts += $created.id
    $item = (Invoke-RestMethod "$BaseUrl/menu" -TimeoutSec 20).items | Where-Object id -eq $created.id
    if ($item.variants.Count -ne 2) { Fail 'Variant count should be 2 after create' }
    $normal = $item.variants | Where-Object name -eq 'Normal'
    $premium = $item.variants | Where-Object name -eq 'Premium'
    if ([decimal]$normal.price -ne 59 -or [decimal]$premium.price -ne 79) { Fail 'Saved Normal/Premium prices are wrong' }
    if ([int]$normal.is_default -ne 1) { Fail 'First variant should be the default' }
    Write-Output 'PASS: create product with Normal/Premium variant prices'

    $null = AdminRequest "/admin/products/$($item.id)" 'Put' @{name=$burgerName;variant_prices=@{Normal=65;Premium=85}}
    $edited = (Invoke-RestMethod "$BaseUrl/menu" -TimeoutSec 20).items | Where-Object id -eq $item.id
    $editedNormal = $edited.variants | Where-Object name -eq 'Normal'
    $editedPremium = $edited.variants | Where-Object name -eq 'Premium'
    if ($editedNormal.id -ne $normal.id -or $editedPremium.id -ne $premium.id) { Fail 'Variant IDs must be preserved on edit' }
    if ([decimal]$editedNormal.price -ne 65 -or [decimal]$editedPremium.price -ne 85) { Fail 'Updated Normal/Premium prices not reflected in menu API' }
    $adminList = (Invoke-RestMethod "$BaseUrl/admin/products" -Headers $adminHeaders -TimeoutSec 20).items | Where-Object id -eq $item.id
    if ((($adminList.variants | Where-Object name -eq 'Normal').price) -ne 65) { Fail 'Reopening edit must show latest saved prices' }
    Write-Output 'PASS: update Normal/Premium prices and read them back'

    $calcNormal = AdminRequest '/cart/validate' 'Post' @{order_type='takeaway';items=@(@{id=$item.id;variant_id=$normal.id;quantity=2;price=0.01})}
    if ([decimal]$calcNormal.subtotal -ne 130) { Fail 'Normal variant must charge the saved Normal price and ignore forged price' }
    $calcPremium = AdminRequest '/cart/validate' 'Post' @{order_type='takeaway';items=@(@{id=$item.id;variant_id=$premium.id;quantity=1;price=0.01})}
    if ([decimal]$calcPremium.subtotal -ne 85) { Fail 'Premium variant must charge the saved Premium price' }
    Write-Output 'PASS: cart validation uses selected variant DB price, ignores forged price'

    try {
        $null = AdminRequest "/admin/products/$($item.id)" 'Put' @{name=$burgerName;variant_prices=@{Normal=-5}}
        Fail 'Invalid variant price accepted'
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 422) { throw }
        Write-Output 'PASS: negative variant price rejected with HTTP 422'
    }

    # --- 2. Staff orders auto-confirm on creation ---
    $burger = $menu.items | Where-Object { $_.name -like '*Burger*' -and $_.variants.Count -gt 0 } | Select-Object -First 1
    if (!$burger) { $burger = $menu.items | Where-Object { $_.variants.Count -gt 0 } | Select-Object -First 1 }
    $burgerVariant = $burger.variants | Where-Object { [int]$_.is_default -eq 1 } | Select-Object -First 1
    if (!$burgerVariant) { $burgerVariant = $burger.variants[0] }
    $staffItems = @(@{id=$burger.id;variant_id=$burgerVariant.id;option_ids=@();quantity=1;client_key='staff-test-1';is_bogo_free=$false;bogo_parent_key=''})
    $idem1 = [guid]::NewGuid().ToString('N')
    $order1 = StaffRequest '/staff/orders' 'Post' @{order_type='takeaway';payment_method='cash';items=$staffItems;customer_name='API Test';idempotency_key=$idem1} @{'X-Idempotency-Key'=$idem1}
    if ($order1.order.status -ne 'accepted') { Fail "Staff order should be auto-confirmed, got $($order1.order.status)" }
    if (!$order1.order.accepted_at) { Fail 'Auto-confirmed staff order must carry accepted_at' }
    Write-Output 'PASS: staff order is automatically confirmed'

    $idem2 = [guid]::NewGuid().ToString('N')
    $order2 = StaffRequest '/staff/orders' 'Post' @{order_type='takeaway';payment_method='cash';items=$staffItems;customer_name='API Test 2';idempotency_key=$idem2} @{'X-Idempotency-Key'=$idem2}
    if ($order2.order.status -ne 'accepted') { Fail 'Consecutive staff order stuck awaiting acceptance' }
    $dashboard = Invoke-RestMethod "$BaseUrl/staff/dashboard" -Headers $staffHeaders -TimeoutSec 20
    if (!($dashboard.current_orders | Where-Object id -eq $order1.order.id)) { Fail 'Auto-confirmed order missing from staff Current Orders' }
    Write-Output 'PASS: consecutive staff orders auto-confirm and list correctly'

    # --- 3. Staff edit keeps order number, discount and recalculates ---
    $editSecond = $menu.items | Where-Object { $_.id -ne $burger.id -and $_.variants.Count -gt 0 } | Select-Object -First 1
    $editSecondVariant = $editSecond.variants | Where-Object { [int]$_.is_default -eq 1 } | Select-Object -First 1
    if (!$editSecondVariant) { $editSecondVariant = $editSecond.variants[0] }
    $editItems = @(
        @{id=$burger.id;variant_id=$burgerVariant.id;option_ids=@();quantity=2;client_key='staff-edit-1';is_bogo_free=$false;bogo_parent_key=''},
        @{id=$editSecond.id;variant_id=$editSecondVariant.id;option_ids=@();quantity=1;client_key='staff-edit-2';is_bogo_free=$false;bogo_parent_key=''}
    )
    $editedOrder = StaffRequest "/staff/orders/$($order1.order.id)/edit" 'Put' @{payment_method='cash';discount_type='fixed';discount_amount='10';discount_reason='API test';items=$editItems} @{}
    if ($editedOrder.order.order_number -ne $order1.order.order_number) { Fail 'Edit must retain the original order number' }
    if ([decimal]$editedOrder.order.discount_amount -lt 10) { Fail 'Edit dropped the permitted staff discount' }
    if ([decimal]$editedOrder.order.total_amount -le 0) { Fail 'Edited totals were not recalculated' }
    if ($editedOrder.order.status -ne 'accepted') { Fail 'Edit changed the confirmed status unexpectedly' }
    Write-Output 'PASS: staff edit updates same order, keeps discount, recalculates totals'

    $editedAgain = StaffRequest "/staff/orders/$($order1.order.id)/edit" 'Put' @{payment_method='cash';items=$editItems} @{}
    if ([decimal]$editedAgain.order.discount_amount -lt 10) { Fail 'Second edit without discount fields must carry the saved discount' }
    Write-Output 'PASS: discount survives edits that omit discount fields'

    # --- 4. BOGO: Friday schedule gating via controlled as_of clock ---
    $pizza = $menu.items | Where-Object { ($_.variants | Where-Object name -in @('S','M','L')).Count -gt 0 } | Select-Object -First 1
    if (!$pizza) { Fail 'Need at least one pizza with S/M/L variants for BOGO tests' }
    $pizzaCategory = $pizza.category_id
    $friday = (Get-Date).Date
    while ($friday.DayOfWeek -ne 'Friday') { $friday = $friday.AddDays(-1) }
    $fridayOffer = AdminRequest '/admin/offers' 'Post' @{name=('Friday BOGO test ' + [guid]::NewGuid().ToString('N'));offer_type='bogo';scope='category';scope_id=$pizzaCategory;category_ids=("[$pizzaCategory]");product_ids='[]';weekdays='["friday"]';size_rules='{}';buy_qty=1;get_qty=1;is_active=1}
    $createdOffers += $fridayOffer.id
    $allDayOffer = AdminRequest '/admin/offers' 'Post' @{name=('Always BOGO test ' + [guid]::NewGuid().ToString('N'));offer_type='bogo';scope='category';scope_id=$pizzaCategory;category_ids=("[$pizzaCategory]");product_ids='[]';weekdays='[]';size_rules='{}';buy_qty=1;get_qty=1;is_active=1}
    $createdOffers += $allDayOffer.id

    $asOfFriday = [uri]::EscapeDataString($friday.ToString('yyyy-MM-dd') + ' 12:00:00')
    $asOfThursday = [uri]::EscapeDataString($friday.AddDays(-1).ToString('yyyy-MM-dd') + ' 12:00:00')
    $fridayActive = Invoke-RestMethod "$BaseUrl/offers/active-bogo?as_of=$asOfFriday" -Headers $adminHeaders -TimeoutSec 20
    if (!($fridayActive.offers | Where-Object id -eq $fridayOffer.id)) { Fail 'Friday offer missing from active-bogo on simulated Friday' }
    if ($fridayActive.weekday -ne 'friday') { Fail 'Simulated weekday should be friday' }
    $thursdayActive = Invoke-RestMethod "$BaseUrl/offers/active-bogo?as_of=$asOfThursday" -Headers $adminHeaders -TimeoutSec 20
    if ($thursdayActive.offers | Where-Object id -eq $fridayOffer.id) { Fail 'Friday offer must not be active on Thursday' }
    Write-Output 'PASS: Friday offer gates correctly with controlled as_of clock'
    try {
        $null = Invoke-RestMethod "$BaseUrl/offers/active-bogo?as_of=$asOfFriday" -TimeoutSec 20
        Fail 'Unauthenticated as_of preview accepted'
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 403) { throw }
        Write-Output 'PASS: as_of preview requires staff/admin login'
    }

    # --- 5. BOGO pair validation server-side ---
    $sPizzas = @($menu.items | Where-Object { $_.category_id -eq $pizzaCategory -and ($_.variants | Where-Object name -eq 'S').Count -gt 0 } | Sort-Object { [decimal](($_.variants | Where-Object name -eq 'S' | Select-Object -First 1).price) })
    if (!$sPizzas.Count) { Fail 'Need an S-size pizza for BOGO pair test' }
    $paidPizza = $sPizzas[-1]
    $freePizza = $sPizzas[0]
    $smallA = ($paidPizza.variants | Where-Object name -eq 'S' | Select-Object -First 1)
    $smallB = ($freePizza.variants | Where-Object name -eq 'S' | Select-Object -First 1)
    $pizza = $paidPizza
    $pizzaB = $freePizza
    $bogoCalc = AdminRequest '/cart/validate' 'Post' @{order_type='takeaway';items=@(
        @{id=$pizza.id;variant_id=$smallA.id;quantity=1;client_key='bogo-paid-1';is_bogo_free=$false;bogo_parent_key=''},
        @{id=$pizzaB.id;variant_id=$smallB.id;quantity=1;client_key='bogo-free-1';is_bogo_free=$true;bogo_parent_key='bogo-paid-1'}
    )}
    if ([decimal]$bogoCalc.bogo_discount -le 0) { Fail 'Qualifying BOGO pair produced no backend discount' }
    Write-Output 'PASS: backend validates qualifying BOGO pair and discounts free item'

    try {
        $null = AdminRequest '/cart/validate' 'Post' @{order_type='takeaway';items=@(
            @{id=$pizzaB.id;variant_id=$smallB.id;quantity=1;client_key='bogo-orphan-1';is_bogo_free=$true;bogo_parent_key='missing-parent'}
        )}
        Fail 'Orphan free item accepted'
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 422) { throw }
        Write-Output 'PASS: backend rejects unlinked free item with HTTP 422'
    }

    # --- 6. Editing an order never creates a duplicate order ---
    $editGet1 = Invoke-RestMethod "$BaseUrl/staff/orders/$($order1.order.id)/edit" -Headers $staffHeaders -TimeoutSec 20
    if ($editGet1.order.order_number -ne $order1.order.order_number) { Fail 'Edit fetch returned a different order number' }
    if ($editGet1.items.Count -ne $editItems.Count) { Fail 'Edited items were not stored on the same order' }

    $repeatEdit = StaffRequest "/staff/orders/$($order1.order.id)/edit" 'Put' @{payment_method='cash';order_id=$order1.order.id;items=$editItems} @{}
    if ($repeatEdit.order.order_number -ne $order1.order.order_number) { Fail 'Repeat edit changed the order number' }
    if ($repeatEdit.order.id -ne $order1.order.id) { Fail 'Repeat edit changed the order ID' }
    $editGet2 = Invoke-RestMethod "$BaseUrl/staff/orders/$($order1.order.id)/edit" -Headers $staffHeaders -TimeoutSec 20
    if ($editGet2.items.Count -ne $editItems.Count) { Fail 'Repeat edit duplicated order items' }
    Write-Output 'PASS: repeated edits update the same order record without duplicating items'

    try {
        $null = StaffRequest "/staff/orders/$($order1.order.id)/edit" 'Put' @{payment_method='cash';order_id=($order1.order.id + 1000000);items=$editItems} @{}
        Fail 'Mismatched order_id accepted on update'
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 422) { throw }
        Write-Output 'PASS: mismatched order_id rejected with HTTP 422'
    }

    $retryCreate = StaffRequest '/staff/orders' 'Post' @{order_type='takeaway';payment_method='cash';items=$staffItems;customer_name='API Test';idempotency_key=$idem1} @{'X-Idempotency-Key'=$idem1}
    if (!$retryCreate.duplicate) { Fail 'Retried create with same idempotency key was not detected' }
    if ($retryCreate.order.id -ne $order1.order.id) { Fail 'Retry created a second order record' }
    Write-Output 'PASS: retried create returns the original order, no duplicate record'

    $idem3 = [guid]::NewGuid().ToString('N')
    $order3 = StaffRequest '/staff/orders' 'Post' @{order_type='takeaway';payment_method='cash';items=$staffItems;customer_name='API Test 3';idempotency_key=$idem3} @{'X-Idempotency-Key'=$idem3}
    if ($order3.order.id -eq $order1.order.id -or $order3.order.id -eq $order2.order.id) { Fail 'Genuine new order did not create a new record' }
    Write-Output 'PASS: genuine new order creates exactly one new record'

    $adminSearch = Invoke-RestMethod "$BaseUrl/admin/orders?q=$($order1.order.order_number)" -Headers $adminHeaders -TimeoutSec 20
    if ((@($adminSearch.orders | Where-Object order_number -eq $order1.order.order_number)).Count -ne 1) { Fail 'Admin Orders must list the edited order exactly once' }
    $staffDash = Invoke-RestMethod "$BaseUrl/staff/dashboard" -Headers $staffHeaders -TimeoutSec 20
    if ((@($staffDash.current_orders | Where-Object order_number -eq $order1.order.order_number)).Count -ne 1) { Fail 'Staff Current Orders must list the edited order exactly once' }
    Write-Output 'PASS: Admin and Staff lists show the edited order exactly once'

    Write-Output 'ALL VARIANT/BOGO/STAFF API TESTS PASSED'
} finally {
    foreach ($id in $createdOffers) {
        try { $null = Invoke-RestMethod "$BaseUrl/admin/offers/$id" -Method Delete -Headers $adminHeaders -TimeoutSec 20 } catch { Write-Output "Cleanup warning: offer $id : $($_.Exception.Message)" }
    }
    foreach ($id in $createdProducts) {
        try { $null = Invoke-RestMethod "$BaseUrl/admin/products/$id" -Method Delete -Headers $adminHeaders -TimeoutSec 20 } catch { Write-Output "Cleanup warning: product $id : $($_.Exception.Message)" }
    }
    Write-Output 'Removed only the products and offers created by this test. Staff test orders are intentionally left for manual verification.'
    try { $null = Invoke-RestMethod "$BaseUrl/auth/admin-logout" -Method Post -Headers $adminHeaders -WebSession $adminSession -TimeoutSec 20 } catch {}
}
