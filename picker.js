/* Project / Task picker.
 *
 * Enhances a native <select name="project_task"> (grouped by client and project)
 * into a searchable, keyboard-accessible combobox:
 *   level 1: favourites, recent selections, then clients with their projects
 *   level 2: the chosen project's tasks, grouped Billable / Non-billable
 * Without JavaScript the native select still works.
 */
(function () {
  "use strict";

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] === false || attrs[key] === null || attrs[key] === undefined) return;
      node.setAttribute(key, attrs[key] === true ? "" : attrs[key]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function norm(value) {
    return (value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function matchesAll(haystack, words) {
    for (var i = 0; i < words.length; i++) if (haystack.indexOf(words[i]) === -1) return false;
    return true;
  }
  // Leading symbols (★, ←) are decoration: screen readers get the words only.
  function labelled(node, text) {
    var symbol = /^([★←]) /.exec(text);
    if (symbol) {
      node.appendChild(el("span", { "aria-hidden": "true" }, symbol[0]));
      text = text.slice(symbol[0].length);
    }
    node.appendChild(document.createTextNode(text));
    return node;
  }

  var counter = 0;

  function Picker(root) {
    this.root = root;
    this.select = root.querySelector("select.picker-native");
    var raw = root.dataset.pickerData;
    this.data = raw ? JSON.parse(raw) : { projects: [], recent: [], favourites: [] };
    this.index = {};
    var self = this;
    this.data.projects.forEach(function (project) {
      project.search = norm([project.client, project.name, project.code].join(" "));
      project.tasks.forEach(function (task) {
        task.search = norm(task.name);
        self.index[String(task.id)] = { project: project, task: task };
      });
    });
    this.favourites = new Set((this.data.favourites || []).map(String));
    this.level = "projects";
    this.currentProject = null;
    this.items = [];
    this.active = -1;
    this.uid = "picker-" + (++counter);
    this.build();
    this.renderButton();
    root.classList.add("enhanced");
  }

  Picker.prototype.build = function () {
    var self = this;
    var label = this.root.querySelector("label");
    var labelId = (label && label.id) || this.uid + "-label";
    if (label) { label.id = labelId; label.setAttribute("for", this.uid + "-button"); }
    this.button = el("button", {
      type: "button", class: "picker-button", id: this.uid + "-button", "aria-haspopup": "dialog",
      "aria-expanded": "false", "aria-controls": this.uid + "-popup", "aria-labelledby": labelId + " " + this.uid + "-button",
    });
    if (this.select.hasAttribute("aria-invalid")) this.button.setAttribute("aria-invalid", "true");
    if (this.select.getAttribute("aria-describedby")) this.button.setAttribute("aria-describedby", this.select.getAttribute("aria-describedby"));
    // The popup is a small non-modal dialog: a search combobox controlling a listbox of grouped options.
    this.popup = el("div", { class: "picker-popup", id: this.uid + "-popup", role: "dialog", "aria-label": "Choose a project and task", hidden: true });
    this.search = el("input", {
      type: "text", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "true",
      "aria-controls": this.uid + "-list", "aria-label": "Search projects and tasks", autocomplete: "off",
      spellcheck: "false", placeholder: "Search…",
    });
    this.context = el("div", { class: "picker-context", hidden: true });
    this.list = el("div", { role: "listbox", id: this.uid + "-list", class: "picker-list", "aria-label": "Projects and tasks" });
    this.empty = el("p", { class: "picker-empty", hidden: true });
    this.live = el("div", { class: "sr-only", "aria-live": "polite" });
    var searchRow = el("div", { class: "picker-search-row" });
    searchRow.appendChild(this.search);
    this.popup.appendChild(searchRow);
    this.popup.appendChild(this.context);
    this.popup.appendChild(this.list);
    this.popup.appendChild(this.empty);
    this.select.insertAdjacentElement("afterend", this.button);
    this.button.insertAdjacentElement("afterend", this.popup);
    this.popup.insertAdjacentElement("afterend", this.live);
    this.select.tabIndex = -1;

    this.button.addEventListener("click", function () { self.isOpen() ? self.close(true) : self.open(); });
    this.button.addEventListener("keydown", function (event) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].indexOf(event.key) !== -1) {
        event.preventDefault();
        self.open();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        self.open(event.key);
      }
    });
    this.search.addEventListener("input", function () { self.render(); });
    this.search.addEventListener("keydown", function (event) { self.onKey(event); });
    this.list.addEventListener("mousedown", function (event) { event.preventDefault(); });
    this.list.addEventListener("click", function (event) {
      var option = event.target.closest("[role=option]");
      if (option) self.choose(+option.dataset.index);
    });
    this.list.addEventListener("mousemove", function (event) {
      var option = event.target.closest("[role=option]");
      if (option && +option.dataset.index !== self.active) self.setActive(+option.dataset.index, false);
    });
    document.addEventListener("mousedown", function (event) {
      if (self.isOpen() && !self.root.contains(event.target)) self.close(false);
    });
    this.popup.addEventListener("focusout", function (event) {
      if (self.isOpen() && event.relatedTarget && !self.root.contains(event.relatedTarget)) self.close(false);
    });

    this.favButton = this.root.parentElement.querySelector("[data-favourite-toggle]");
    if (this.favButton) {
      this.favButton.addEventListener("click", function () { self.toggleFavourite(); });
    }
  };

  Picker.prototype.isOpen = function () { return !this.popup.hidden; };

  Picker.prototype.open = function (initial) {
    var selected = this.index[this.select.value];
    this.level = "projects";
    this.currentProject = null;
    if (selected && !initial) { this.level = "tasks"; this.currentProject = selected.project; }
    this.popup.hidden = false;
    this.root.classList.add("open");
    this.button.setAttribute("aria-expanded", "true");
    this.search.value = initial || "";
    this.render();
    this.search.focus();
  };

  Picker.prototype.close = function (focusButton) {
    this.popup.hidden = true;
    this.root.classList.remove("open");
    this.button.setAttribute("aria-expanded", "false");
    this.search.removeAttribute("aria-activedescendant");
    if (focusButton) this.button.focus();
  };

  Picker.prototype.ptItem = function (id, groupLabel) {
    var entry = this.index[String(id)];
    if (!entry) return null;
    return {
      kind: "pt", value: String(id), label: entry.project.name + " › " + entry.task.name,
      sub: entry.project.client + " · " + entry.project.code + (entry.task.billable ? " · billable" : " · non-billable"),
    };
  };

  Picker.prototype.buildItems = function () {
    var self = this;
    var query = norm(this.search.value.trim());
    var words = query ? query.split(/\s+/) : [];
    var items = [];
    var group = function (label) { items.push({ kind: "group", label: label }); };

    if (this.level === "tasks" && this.currentProject) {
      var project = this.currentProject;
      items.push({ kind: "back", label: "← All projects" });
      ["billable", "non-billable"].forEach(function (kind) {
        var tasks = project.tasks.filter(function (task) {
          return (kind === "billable") === !!task.billable && matchesAll(task.search, words);
        });
        if (!tasks.length) return;
        group(kind === "billable" ? "Billable" : "Non-billable");
        tasks.forEach(function (task) {
          items.push({ kind: "pt", value: String(task.id), label: task.name, sub: self.favourites.has(String(task.id)) ? "★ favourite" : "" });
        });
      });
      return items;
    }

    if (!words.length) {
      var favs = (this.data.favourites || []).map(function (id) { return self.ptItem(id); }).filter(Boolean);
      if (favs.length) { group("★ Favourites"); items = items.concat(favs); }
      var recent = (this.data.recent || []).filter(function (id) { return !self.favourites.has(String(id)); })
        .map(function (id) { return self.ptItem(id); }).filter(Boolean);
      if (recent.length) { group("Recent"); items = items.concat(recent); }
    }
    var lastClient = null;
    this.data.projects.forEach(function (project) {
      if (words.length && !matchesAll(project.search, words)) return;
      if (project.client !== lastClient) { group(project.client); lastClient = project.client; }
      items.push({ kind: "project", value: String(project.id), label: project.name, sub: project.code, project: project });
    });
    if (words.length) {
      var combos = [];
      this.data.projects.forEach(function (project) {
        project.tasks.forEach(function (task) {
          if (combos.length < 30 && matchesAll(project.search + " " + task.search, words) && !matchesAll(project.search, words)) {
            combos.push(self.ptItem(task.id));
          }
        });
      });
      if (combos.length) { group("Matching tasks"); items = items.concat(combos); }
    }
    return items;
  };

  Picker.prototype.render = function () {
    var self = this;
    var project = this.level === "tasks" ? this.currentProject : null;
    this.items = this.buildItems();
    this.context.hidden = !project;
    this.context.textContent = "";
    if (project) {
      this.context.appendChild(el("span", { class: "picker-client" }, project.client + " · " + project.code));
      this.context.appendChild(el("span", { class: "picker-project" }, project.name));
    }
    this.list.setAttribute("aria-label", project ? "Tasks for " + project.name : "Projects and tasks");
    this.list.textContent = "";
    var container = this.list, optionCount = 0, groupCount = 0;
    this.items.forEach(function (item, index) {
      if (item.kind === "group") {
        // Options sit in labelled groups (a client, Recent, Billable…) so the group name is announced with them.
        var labelId = self.uid + "-group-" + (++groupCount);
        container = el("div", { role: "group", "aria-labelledby": labelId });
        container.appendChild(labelled(el("div", { class: "picker-group", id: labelId }), item.label));
        self.list.appendChild(container);
        return;
      }
      optionCount++;
      var node = el("div", {
        role: "option", id: self.uid + "-opt-" + index, class: "picker-option" + (item.kind === "back" ? " back" : ""),
        "data-index": index, "aria-selected": "false",
      });
      labelled(node, item.label);
      if (item.sub) node.appendChild(labelled(el("span", { class: "sub" }), item.sub));
      container.appendChild(node);
    });
    var empty = !optionCount || (optionCount === 1 && this.items[0].kind === "back" && !!this.search.value);
    this.empty.hidden = !empty;
    this.empty.textContent = !empty ? ""
      : project ? "No matching tasks in " + project.name + ". Choose “All projects” to search everything."
      : this.data.projects.length ? "No matches. Try another word."
      : "You aren't assigned to any active projects yet. Ask an administrator to add you.";
    var firstSelectable = this.items.findIndex(function (item) {
      return item.kind === "pt" || item.kind === "project";
    });
    var selectedIndex = this.items.findIndex(function (item) {
      return item.kind === "pt" && item.value === self.select.value;
    });
    this.setActive(selectedIndex >= 0 && !this.search.value ? selectedIndex : firstSelectable, true);
    this.live.textContent = empty ? this.empty.textContent : optionCount + (optionCount === 1 ? " option" : " options");
  };

  Picker.prototype.setActive = function (index, scroll) {
    var previous = this.list.querySelector(".picker-option.active");
    if (previous) { previous.classList.remove("active"); previous.setAttribute("aria-selected", "false"); }
    this.active = index;
    var node = index >= 0 ? document.getElementById(this.uid + "-opt-" + index) : null;
    if (node) {
      node.classList.add("active");
      node.setAttribute("aria-selected", "true");
      this.search.setAttribute("aria-activedescendant", node.id);
      if (scroll) node.scrollIntoView({ block: "nearest" });
    } else {
      this.search.removeAttribute("aria-activedescendant");
    }
  };

  Picker.prototype.move = function (delta) {
    var options = [];
    this.items.forEach(function (item, index) {
      if (item.kind === "pt" || item.kind === "project" || item.kind === "back") options.push(index);
    });
    if (!options.length) return;
    var position = options.indexOf(this.active);
    if (delta === Infinity) position = options.length - 1;
    else if (delta === -Infinity) position = 0;
    else position = position === -1 ? 0 : Math.max(0, Math.min(options.length - 1, position + delta));
    this.setActive(options[position], true);
  };

  Picker.prototype.onKey = function (event) {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); this.move(1); break;
      case "ArrowUp": event.preventDefault(); this.move(-1); break;
      case "PageDown": event.preventDefault(); this.move(8); break;
      case "PageUp": event.preventDefault(); this.move(-8); break;
      case "Home": if (event.ctrlKey) { event.preventDefault(); this.move(-Infinity); } break;
      case "End": if (event.ctrlKey) { event.preventDefault(); this.move(Infinity); } break;
      case "Enter":
        event.preventDefault();
        if (this.active >= 0) this.choose(this.active);
        break;
      case "Escape":
        event.preventDefault();
        if (this.search.value) { this.search.value = ""; this.render(); }
        else if (this.level === "tasks") { this.back(); }
        else { this.close(true); }
        break;
      case "Backspace":
        if (!this.search.value && this.level === "tasks") { event.preventDefault(); this.back(); }
        break;
      case "Tab":
        this.close(false);
        break;
    }
  };

  Picker.prototype.back = function () {
    this.level = "projects";
    this.currentProject = null;
    this.search.value = "";
    this.render();
  };

  Picker.prototype.choose = function (index) {
    var item = this.items[index];
    if (!item) return;
    if (item.kind === "back") { this.back(); return; }
    if (item.kind === "project") {
      if (item.project.tasks.length === 1) { this.commit(String(item.project.tasks[0].id)); return; }
      this.level = "tasks";
      this.currentProject = item.project;
      this.search.value = "";
      this.render();
      this.live.textContent = "Choose a task for " + item.project.name;
      return;
    }
    if (item.kind === "pt") this.commit(item.value);
  };

  Picker.prototype.commit = function (value) {
    this.select.value = value;
    this.select.dispatchEvent(new Event("change", { bubbles: true }));
    this.renderButton();
    this.close(false);
    var form = this.select.form;
    var next = form && form.querySelector("[data-after-picker]");
    (next || this.button).focus();
  };

  Picker.prototype.renderButton = function () {
    var entry = this.index[this.select.value];
    this.button.textContent = "";
    if (!entry) {
      this.button.appendChild(el("span", { class: "picker-project picker-placeholder" }, "Choose a project and task"));
    } else {
      this.button.appendChild(el("span", { class: "picker-client" }, entry.project.client));
      this.button.appendChild(el("span", { class: "picker-project" }, entry.project.name));
      this.button.appendChild(el("span", { class: "picker-task" }, entry.task.name + (entry.task.billable ? " · billable" : " · non-billable")));
    }
    if (this.favButton) {
      var isFav = entry && this.favourites.has(this.select.value);
      this.favButton.hidden = !entry;
      // A toggle button keeps one name; aria-pressed (and the filled star) carry the state.
      this.favButton.setAttribute("aria-pressed", isFav ? "true" : "false");
      this.favButton.title = isFav ? "Remove from favourites" : "Add to favourites";
      this.favButton.textContent = "";
      this.favButton.appendChild(el("span", { "aria-hidden": "true" }, isFav ? "★ " : "☆ "));
      this.favButton.appendChild(document.createTextNode("Favourite"));
    }
  };

  Picker.prototype.toggleFavourite = function () {
    var self = this;
    var value = this.select.value;
    if (!value) return;
    var csrf = document.querySelector('meta[name="csrf-token"]');
    var body = new URLSearchParams({ project_task: value });
    fetch(this.favButton.dataset.url, {
      method: "POST", credentials: "same-origin", body: body,
      headers: { "X-CSRFToken": csrf ? csrf.content : "", Accept: "application/json" },
    })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (state) {
        if (state.favourite) {
          self.favourites.add(value);
          if (self.data.favourites.indexOf(+value) === -1) self.data.favourites.push(+value);
        } else {
          self.favourites.delete(value);
          self.data.favourites = self.data.favourites.filter(function (id) { return String(id) !== value; });
        }
        self.renderButton();
      })
      .catch(function () { if (window.peachToast) window.peachToast("Couldn't update favourites. Try again.", "error"); });
  };

  window.PeachPicker = {
    initAll: function (scope) {
      (scope || document).querySelectorAll("[data-picker]").forEach(function (root) {
        if (root.dataset.pickerReady) return;
        root.dataset.pickerReady = "1";
        root.peachPicker = new Picker(root);
      });
    },
  };
})();
