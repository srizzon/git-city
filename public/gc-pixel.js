(function(){
  var s = document.currentScript;
  var cid = null;

  // 1. URL params
  try {
    var p = new URLSearchParams(location.search);
    cid = p.get("gc_click_id");
  } catch(e){}

  // 2. Referrer
  if (!cid) {
    try {
      var r = new URL(document.referrer);
      cid = new URLSearchParams(r.search).get("gc_click_id");
    } catch(e){}
  }

  // 3. sessionStorage
  if (!cid) {
    try { cid = sessionStorage.getItem("gc_click_id"); } catch(e){}
  }

  // Persist for multi-page funnels
  if (cid) {
    try { sessionStorage.setItem("gc_click_id", cid); } catch(e){}
  }

  if (!cid || !/^gc_/.test(cid)) return;

  var body = { click_id: cid };
  if (s) {
    var ev = s.getAttribute("data-event");
    var oid = s.getAttribute("data-order-id");
    var rev = s.getAttribute("data-revenue");
    if (ev) body.event_name = ev;
    if (oid) body.order_id = oid;
    if (rev) body.revenue = parseFloat(rev);
  }

  var url = "https://thegitcity.com/api/v1/ads/conversions";
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
  } else {
    var x = new XMLHttpRequest();
    x.open("POST", url, true);
    x.setRequestHeader("Content-Type", "application/json");
    x.send(JSON.stringify(body));
  }
})();
