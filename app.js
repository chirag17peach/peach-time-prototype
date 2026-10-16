/* Peach Time client helpers. Progressive enhancement only: every form works without JS. */
(function () {
  "use strict";

  var csrf = document.querySelector('meta[name="csrf-token"]');

  // ---------------------------------------------------------------- htmx wiring
  document.addEventListener("htmx:configRequest", function (event) {
    if (csrf) event.detail.headers["X-CSRFToken"] = csrf.content;
  });
  document.addEventListener("htmx:responseError", function (event) {
    var status = event.detail.xhr ? event.detail.xhr.status : "";
    var message = "Not saved (error " + status + "). Your input is still here. Please try again.";
    if (status === 403) message = "You don't have permission to do that.";
    if (status === 404) message = "That item no longer exists. Reload the page.";
    if (status === 409) message = "Someone else changed this. Reload to see the latest version.";
    toast(message, "error");
  });
  document.addEventListener("htmx:sendError", function () {
    toast("Network problem: nothing was saved. Check your connection and try again.", "error");
  });
  document.addEventListener("htmx:afterSettle", function (event) {
    var elt = event.detail.elt;
    init(elt);
    if (elt.id === "day-panel" || elt.id === "week-panel") afterPanelUpdate(elt);
    else if (elt.id === "cell-details") focusFirst(elt, ["h2"]);
    else if (elt.matches && elt.matches("li.entry") && focusLost()) focusFirst(elt, ["button, input, select, textarea"]);  // inline edit opened
  });

  // ---------------------------------------------------------------- focus and announcements after in-place updates
  // A swapped panel replaces the control that had focus, and live regions that arrive inside new content are
  // often not announced. So: focus the first invalid field after a failed save; otherwise, if focus was lost,
  // move it somewhere sensible; and repeat the panel's messages in #announcer, which never gets swapped.
  var INVALID = '[aria-invalid="true"]';
  var AFTER_UPDATE = [INVALID, ".alert-error", ".entry.is-new", ".timer-card", "#add-time", "#week-panel h2"];
  var requestedFrom = null;  // id of the control that started the request (hx-disabled-elt blurs it meanwhile)

  document.addEventListener("htmx:beforeRequest", function () {
    requestedFrom = document.activeElement ? document.activeElement.id : null;
  });

  function focusLost() {
    var active = document.activeElement;
    return !active || active === document.body || !document.body.contains(active);
  }
  function focusFirst(scope, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var candidates = scope.querySelectorAll(selectors[i]);
      for (var j = 0; j < candidates.length; j++) {
        var target = candidates[j];
        if (target.type === "hidden" || !target.getClientRects().length) continue;  // hidden inputs, the native picker select
        if (!target.matches("a[href], button, input, select, textarea, [tabindex]")) target.setAttribute("tabindex", "-1");
        target.focus();
        return true;
      }
    }
    return false;
  }
  function announce(text) {
    var region = document.getElementById("announcer");
    if (!region || !text) return;
    region.textContent = "";
    setTimeout(function () { region.textContent = text; }, 100);  // a change, even when the text repeats
  }
  function afterPanelUpdate(panel) {
    if (!focusFirst(panel, [INVALID]) && focusLost()) {
      var again = requestedFrom && document.getElementById(requestedFrom);  // the same control in the new panel
      if (again && panel.contains(again)) again.focus();
      else focusFirst(panel, AFTER_UPDATE);
    }
    var texts = [];
    panel.querySelectorAll(".messages li:not(.alert-error), .alert-warning").forEach(function (node) {
      texts.push(node.textContent.trim());
    });
    announce(texts.join(" "));
  }

  // ---------------------------------------------------------------- toasts
  function toast(text, kind) {
    var region = document.querySelector(".toast-region");
    if (!region) return;
    var item = document.createElement("div");
    item.className = "alert alert-" + (kind || "info");
    item.setAttribute("role", kind === "error" ? "alert" : "status");
    item.textContent = text;
    region.appendChild(item);
    setTimeout(function () { item.remove(); }, kind === "error" ? 9000 : 5000);
  }
  window.peachToast = toast;

  // ---------------------------------------------------------------- durations (mirrors apps/core/durations.py)
  function parseDuration(text, maxSeconds) {
    maxSeconds = maxSeconds || 86400;
    var raw = (text || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!raw) return { error: "" };
    var compact = raw.replace(/ /g, "");
    var seconds, m = compact.match(/^(\d{0,3}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      var mins = +m[2], secs = +(m[3] || 0);
      if (mins >= 60 || secs >= 60) return { error: "Minutes must be under 60. For an hour and a half, enter 1:30." };
      seconds = (+(m[1] || 0)) * 3600 + mins * 60 + secs;
    } else if (/^\d{0,4}(?:[.,]\d{1,6})?$/.test(compact) && compact !== "." && compact !== ",") {
      seconds = Math.round(parseFloat(compact.replace(",", ".")) * 3600);
    } else {
      m = raw.match(/^(?:(\d{1,4}(?:[.,]\d{1,6})?)\s*h(?:ours?|rs?)?)?\s*(?:(\d{1,5}(?:[.,]\d{1,6})?)\s*m(?:in(?:ute)?s?)?)?$/);
      if (!m || !(m[1] || m[2])) return { error: "Use a format like 1.5, 1:30, 1h 30m or 90m." };
      seconds = Math.round(parseFloat((m[1] || "0").replace(",", ".")) * 3600 + parseFloat((m[2] || "0").replace(",", ".")) * 60);
    }
    if (!(seconds > 0)) return { error: "The duration must be more than zero." };
    if (seconds > maxSeconds) return { error: "A single entry can be at most " + hm(maxSeconds) + "." };
    return { seconds: seconds };
  }
  function hm(seconds) {
    var minutes = Math.round(seconds / 60);
    return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0");
  }
  function describe(seconds) {
    var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60, parts = [];
    if (h) parts.push(h + " h");
    if (m) parts.push(m + " min");
    if (s) parts.push(s + " s");
    return parts.join(" ") || "0 min";
  }
  window.peachDuration = { parse: parseDuration, hm: hm, describe: describe };

  function bindDurationHints(scope) {
    scope.querySelectorAll("input[data-duration]").forEach(function (input) {
      if (input.dataset.bound) return;
      input.dataset.bound = "1";
      var hint = document.getElementById(input.getAttribute("aria-describedby") ? input.getAttribute("aria-describedby").split(" ")[0] : "");
      var update = function () {
        if (!hint) return;
        var result = parseDuration(input.value, +(input.dataset.max || 86400));
        if (result.seconds) {
          hint.textContent = "= " + describe(result.seconds) + " · " + (result.seconds / 3600).toFixed(2) + " h";
          hint.classList.remove("invalid");
        } else {
          hint.textContent = result.error || hint.dataset.default || "";
          hint.classList.toggle("invalid", !!result.error);
        }
      };
      if (hint && !hint.dataset.default) hint.dataset.default = hint.textContent;
      input.addEventListener("input", update);
      // After a failed save the server's error is already shown (and described); don't repeat it in the hint.
      if (input.value && input.getAttribute("aria-invalid") !== "true") update();
    });
  }

  // ---------------------------------------------------------------- running timer display
  var clockOffset = 0;
  function bindTimers(scope) {
    scope.querySelectorAll("[data-timer-started]").forEach(function (node) {
      if (node.dataset.bound) return;
      node.dataset.bound = "1";
      if (node.dataset.serverNow) clockOffset = Date.parse(node.dataset.serverNow) - Date.now();
    });
  }
  function tick() {
    document.querySelectorAll("[data-timer-started]").forEach(function (node) {
      var started = Date.parse(node.dataset.timerStarted);
      var seconds = Math.max(0, Math.floor((Date.now() + clockOffset - started) / 1000));
      var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
      node.textContent = h + ":" + String(m).padStart(2, "0") + (node.dataset.seconds === "no" ? "" : ":" + String(s).padStart(2, "0"));
    });
  }
  setInterval(tick, 1000);

  // When the tab becomes visible again, check whether the timer changed elsewhere.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    var marker = document.querySelector("[data-timer-state-url]");
    if (!marker) return;
    fetch(marker.dataset.timerStateUrl, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (state) {
        if (!state) return;
        var current = marker.dataset.timerId || "";
        if ((state.timer_id || "") !== current) {
          toast("Your timer changed in another window. Refreshing…", "info");
          setTimeout(function () { window.location.reload(); }, 800);
        }
      })
      .catch(function () { /* offline: keep showing the last known state */ });
  });

  // ---------------------------------------------------------------- confirmations and misc
  document.addEventListener("submit", function (event) {
    var form = event.target;
    // htmx forms confirm through hx-confirm (before the request); confirming again here would be too late to cancel.
    if (form.dataset.confirm && !form.hasAttribute("hx-confirm") && !window.confirm(form.dataset.confirm)) {
      event.preventDefault();
      return;
    }
    if (form.dataset.submitting === "1" && !form.hasAttribute("hx-post")) {
      event.preventDefault(); // double-click protection; idempotency keys protect the server too
      return;
    }
    form.dataset.submitting = "1";
    setTimeout(function () { form.dataset.submitting = ""; }, 4000);
    var grid = form.closest("[data-week-grid]");
    if (grid) grid.dataset.dirty = "";
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-print]")) window.print();
    var menu = document.querySelector("details.user-menu[open]");
    if (menu && !menu.contains(event.target)) menu.open = false;
  });

  // The account menu is a <details> disclosure: Escape closes it and returns focus to its summary.
  document.addEventListener("keydown", function (event) {
    var menu = event.key === "Escape" && event.target.closest && event.target.closest("details.user-menu[open]");
    if (!menu) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });

  document.addEventListener("change", function (event) {
    var target = event.target;
    if (target.matches("[data-autosubmit]")) target.form.requestSubmit();
    if (target.matches("[data-navigate]") && target.value) {
      var url = target.dataset.navigate.replace("__value__", encodeURIComponent(target.value));
      window.location.assign(url);
    }
  });

  // ---------------------------------------------------------------- week grid
  function bindWeekGrid(scope) {
    scope.querySelectorAll("[data-week-grid]").forEach(function (grid) {
      if (grid.dataset.bound) return;
      grid.dataset.bound = "1";
      var status = grid.querySelector("[data-dirty-status]");
      var markDirty = function () {
        var count = grid.querySelectorAll("input.dirty").length;
        grid.dataset.dirty = count ? "1" : "";
        // Colour isn't the only sign of unsaved cells: the count is shown as text and announced.
        var text = !count ? "" : count === 1 ? "1 unsaved change" : count + " unsaved changes";
        if (status && status.textContent !== text) status.textContent = text;
      };
      grid.addEventListener("input", function (event) {
        var input = event.target;
        if (!input.matches("input[data-original]")) return;
        input.classList.toggle("dirty", input.value.trim() !== input.dataset.original);
        markDirty();
      });
      markDirty();  // a grid returned with errors still holds the unsaved input
      grid.addEventListener("keydown", function (event) {
        var input = event.target;
        if (!input.matches(".cell input") || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        var cell = input.closest("td");
        var row = cell.parentElement;
        var index = Array.prototype.indexOf.call(row.children, cell);
        var nextRow = event.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
        while (nextRow) {
          var target = nextRow.children[index] && nextRow.children[index].querySelector("input:not([type=hidden])");
          if (target) { event.preventDefault(); target.focus(); target.select(); return; }
          nextRow = event.key === "ArrowUp" ? nextRow.previousElementSibling : nextRow.nextElementSibling;
        }
      });
    });
  }
  window.addEventListener("beforeunload", function (event) {
    if (document.querySelector("[data-week-grid][data-dirty='1']")) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  function init(scope) {
    scope = scope || document;
    bindDurationHints(scope);
    bindTimers(scope);
    bindWeekGrid(scope);
    if (window.PeachPicker) window.PeachPicker.initAll(scope);
    tick();
  }
  document.addEventListener("DOMContentLoaded", function () { init(document); });
})();
