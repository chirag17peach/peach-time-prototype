/* Static prototype helpers: show what this preview is, and turn off anything that needs the server. */
(function () {
  "use strict";

  function region() {
    var r = document.querySelector(".toast-region");
    if (!r) {
      r = document.createElement("div");
      r.className = "toast-region";
      r.setAttribute("aria-live", "polite");
      document.body.appendChild(r);
    }
    return r;
  }

  function note(text) {
    var item = document.createElement("div");
    item.className = "alert alert-info";
    item.setAttribute("role", "status");
    item.textContent = text;
    region().appendChild(item);
    setTimeout(function () { item.remove(); }, 6000);
  }

  function addBar() {
    var bar = document.createElement("div");
    bar.className = "proto-bar";
    bar.setAttribute("role", "note");
    var home = document.createElement("a");
    home.href = "index.html";
    home.textContent = "← All screens";
    var label = document.createElement("span");
    label.textContent = "Peach Time prototype · fictitious demo data · saving is off";
    var who = document.createElement("span");
    who.className = "proto-who";
    who.textContent = document.body.getAttribute("data-proto-role") || "";
    bar.appendChild(home);
    bar.appendChild(label);
    bar.appendChild(who);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  document.addEventListener("submit", function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    note("This is a static preview, so saving, filters and timers are turned off. In Peach Time, this runs on the server.");
  }, true);

  document.addEventListener("click", function (event) {
    var el = event.target.closest("[data-proto-missing], [data-print], [data-favourite-toggle]");
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (el.hasAttribute("data-print")) note("In Peach Time, Print / PDF opens the browser's print dialog. It's off in this preview.");
    else if (el.hasAttribute("data-favourite-toggle")) note("Favourites are saved on the server, so they're off in this preview.");
    else note(el.getAttribute("data-proto-missing"));
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addBar);
  else addBar();
})();
