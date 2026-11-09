"use strict";

// Shared progressive enhancements. No lab, analytics, or third-party requests.
document.documentElement.classList.add("js");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const narrowDiagram = window.matchMedia("(max-width: 850px)");
const scrollMode = () => reducedMotion.matches ? "instant" : "smooth";

// Real relative HTML links load the pages; the active-page state is in the HTML.
const menuButton = document.querySelector(".menu-toggle");
const navigation = document.getElementById("primary-nav");
function closeMenu(returnFocus = false) {
  navigation.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  if (returnFocus) menuButton.focus();
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  navigation.classList.toggle("is-open", open);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") closeMenu(true);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav-wrap")) closeMenu();
});
document.addEventListener("focusin", (event) => {
  if (!event.target.closest(".nav-wrap")) closeMenu();
});
window.matchMedia("(min-width: 651px)").addEventListener("change", (event) => {
  if (event.matches) closeMenu();
});

// Architecture behavior only initializes on the Architecture page.
const componentDetails = document.getElementById("component-details");
if (componentDetails) {
  const nodes = [...document.querySelectorAll("[data-node]")];
  const panels = [...document.querySelectorAll("[data-component-panel]")];
  const tabs = [...document.querySelectorAll("[data-view]")];
  const viewPanels = [...document.querySelectorAll("[data-view-panel]")];
  const flowButtons = [...document.querySelectorAll("[data-flow]")];
  const flowPanels = [...document.querySelectorAll("[data-flow-panel]")];
  const announcement = document.getElementById("diagram-announcement");
  let selectedNode = nodes.find((node) => node.dataset.node === "host");
  let activeFlow = "remote";

  function selectNode(node, bringIntoView = false) {
    selectedNode = node;
    const key = node.dataset.node;
    nodes.forEach((item) => item.setAttribute("aria-pressed", String(item === node)));
    panels.forEach((panel) => { panel.hidden = panel.dataset.componentPanel !== key; });
    const panel = panels.find((item) => item.dataset.componentPanel === key);
    announcement.textContent = `Showing configuration notes for ${panel.querySelector("h3").textContent}.`;
    if (bringIntoView) {
      componentDetails.focus({ preventScroll: true });
      componentDetails.scrollIntoView({ behavior: scrollMode(), block: "start" });
    }
  }
  nodes.forEach((node) => node.addEventListener("click", () => selectNode(node, narrowDiagram.matches)));
  document.querySelector(".return-to-node").addEventListener("click", () => {
    selectedNode.focus({ preventScroll: true });
    selectedNode.scrollIntoView({ behavior: scrollMode(), block: "center" });
  });

  function selectFlow(key) {
    activeFlow = key;
    flowButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.flow === key)));
    flowPanels.forEach((panel) => { panel.hidden = panel.dataset.flowPanel !== key; });
    selectNode(document.getElementById(`flow-${key}`).querySelector("[data-node]"));
  }
  flowButtons.forEach((button) => button.addEventListener("click", () => selectFlow(button.dataset.flow)));

  function selectView(key) {
    tabs.forEach((tab) => {
      const active = tab.dataset.view === key;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    viewPanels.forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== key; });
    if (key === "network") selectFlow(activeFlow);
    else selectNode(nodes.find((node) => node.dataset.node === "host"));
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectView(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      let target;
      if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = tabs.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      tabs[target].focus();
      selectView(tabs[target].dataset.view);
    });
  });
}

// Native details support card reversal even without JavaScript.
document.querySelectorAll("[data-close-card]").forEach((button) => {
  button.addEventListener("click", () => {
    const card = button.closest(".service-card");
    card.open = false;
    const summary = card.querySelector("summary");
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ behavior: scrollMode(), block: "nearest" });
  });
});

// Expand a linked case before scrolling, including links arriving from other pages.
const cases = [...document.querySelectorAll(".case-study")];
const expandCases = document.getElementById("expand-cases");
function syncExpandControl() {
  if (!expandCases) return;
  const allOpen = cases.every((item) => item.open);
  expandCases.textContent = allOpen ? "Collapse all case studies" : "Expand all case studies";
  expandCases.setAttribute("aria-expanded", String(allOpen));
}
if (expandCases) {
  expandCases.setAttribute("aria-controls", cases.map((item) => item.id).join(" "));
  expandCases.addEventListener("click", () => {
    const shouldOpen = !cases.every((item) => item.open);
    cases.forEach((item) => { item.open = shouldOpen; });
    syncExpandControl();
  });
  cases.forEach((item) => item.addEventListener("toggle", syncExpandControl));
}
function revealHash(shouldFocus = false) {
  let id;
  try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  const disclosure = target.closest("details");
  if (disclosure) {
    disclosure.open = true;
    syncExpandControl();
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "instant", block: "start" });
      if (shouldFocus) disclosure.querySelector("summary").focus({ preventScroll: true });
    });
  }
}
window.addEventListener("hashchange", () => revealHash(true));
document.querySelectorAll('.case-index a[href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    const target = document.getElementById(link.hash.slice(1));
    if (target) {
      target.open = true;
      target.querySelector("summary").focus({ preventScroll: true });
    }
  });
});
revealHash();

// Native dialog handles focus containment and Escape. Image links are the fallback.
const lightbox = document.querySelector(".lightbox");
let lightboxTrigger = null;
if (lightbox && typeof lightbox.showModal === "function") {
  document.querySelectorAll("[data-lightbox]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const figure = link.closest("figure");
      const sourceImage = link.querySelector("img");
      const image = sourceImage.cloneNode(false);
      image.removeAttribute("loading");
      lightbox.querySelector(".lightbox-image-wrap").replaceChildren(image);
      lightbox.querySelector("#lightbox-title").textContent = figure.querySelector("figcaption strong").textContent;
      lightbox.querySelector(".lightbox-caption").textContent = figure.querySelector("figcaption p").textContent;
      lightboxTrigger = link;
      lightbox.showModal();
      document.body.classList.add("modal-open");
      lightbox.querySelector(".lightbox-close").focus();
    });
  });
  lightbox.querySelector(".lightbox-close").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (event) => {
    const bounds = lightbox.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (event.target === lightbox && outside) lightbox.close();
  });
  lightbox.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    lightboxTrigger?.focus({ preventScroll: true });
  });
}
