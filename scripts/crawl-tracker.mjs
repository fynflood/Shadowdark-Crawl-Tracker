/**
 * Shadowdark Crawl Initiative Tracker
 * 
 * A simple module to track turns during the crawler phase.
 */

class CrawlTracker extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._participants = [];
    this._activeIndex = 0;
    this._movementLocked = false;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "shadowdark-crawl-tracker",
    classes: ["shadowdark-crawl-app"],
    window: {
      title: "Crawl Initiative",
      resizable: true,
      icon: "fa-solid fa-shoe-prints"
    },
    position: {
      width: 300,
      height: "auto"
    },
    actions: {
      nextTurn: CrawlTracker.prototype._onNextTurn,
      resetTracker: CrawlTracker.prototype._onResetTracker,
      moveUp: CrawlTracker.prototype._onMoveUp,
      moveDown: CrawlTracker.prototype._onMoveDown,
      refresh: CrawlTracker.prototype._onRefresh,
      toggleLock: CrawlTracker.prototype._onToggleLock,
      toggleCombatLock: CrawlTracker.prototype._onToggleCombatLock
    }
  };

  static PARTS = {
    form: {
      template: "modules/shadowdark-crawl-tracker/templates/crawl-tracker.hbs"
    }
  };

  async _prepareContext(_options) {
    await this._loadState();

    // Ensure GM is in the list
    if (!this._participants.some(p => p.isGM)) {
      this._participants.unshift(this._generateGMParticipant());
    }

    // Shadowdark actors are usually of type 'player' (lowercase)
    const playerActors = game.actors.contents.filter(a => {
      const t = a.type.toLowerCase();
      return (t === "player" || t === "character" || a.hasPlayerOwner) && a.name;
    });

    // console.log(`Shadowdark Crawl Tracker | Searching for players... Found ${playerActors.length} candidates.`);

    for (const actor of playerActors) {
      if (!this._participants.some(p => p.actorId === actor.id)) {
        // console.log(`Shadowdark Crawl Tracker | Adding player: ${actor.name}`);
        this._participants.push({
          id: foundry.utils.randomID(),
          name: actor.name,
          img: actor.img || "icons/svg/mystery-man.svg",
          actorId: actor.id,
          isGM: false
        });
      }
    }

    // Filter out participants whose actors no longer exist (except for the GM)
    this._participants = this._participants.filter(p => {
      if (p.isGM) return true;
      const exists = game.actors.has(p.actorId);
      // if (!exists) console.log(`Shadowdark Crawl Tracker | Removing missing actor: ${p.name}`);
      return exists;
    });

    return {
      participants: this._participants,
      activeIndex: this._activeIndex,
      activeIndex: this._activeIndex,
      isGM: game.user.isGM,
      movementLocked: this._movementLocked,
      combatMovementLock: game.settings.get("shadowdark-crawl-tracker", "combatMovementLock")
    };
  }

  _onRender(context, options) {
    if (!game.user.isGM) return;

    const html = this.element;
    const listItems = html.querySelectorAll(".participant-item");

    listItems.forEach(li => {
      li.addEventListener("dragstart", this._onDragStart.bind(this));
      li.addEventListener("dragover", this._onDragOver.bind(this));
      li.addEventListener("drop", this._onDrop.bind(this));
    });
  }

  _onDragStart(event) {
    event.dataTransfer.setData("text/plain", event.currentTarget.dataset.id);
  }

  _onDragOver(event) {
    event.preventDefault();
  }

  async _onDrop(event) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain");
    const targetId = event.currentTarget.dataset.id;

    if (draggedId === targetId) return;

    const draggedIndex = this._participants.findIndex(p => p.id === draggedId);
    const targetIndex = this._participants.findIndex(p => p.id === targetId);

    if (draggedIndex < 0 || targetIndex < 0) return;

    // Identify the currently active participant before we shuffle
    const activeParticipantId = this._participants[this._activeIndex].id;

    // Move the item
    const [draggedItem] = this._participants.splice(draggedIndex, 1);
    this._participants.splice(targetIndex, 0, draggedItem);

    // Find the new index of the collected active participant
    const newActiveIndex = this._participants.findIndex(p => p.id === activeParticipantId);
    this._activeIndex = newActiveIndex;

    await this._saveState();
    this.render();
  }

  _generateGMParticipant() {
    return {
      id: "gm-participant",
      name: "Gamemaster",
      img: "icons/svg/d20-grey.svg",
      actorId: null,
      isGM: true
    };
  }

  async _loadState() {
    const state = game.settings.get("shadowdark-crawl-tracker", "trackerState");
    if (state && state.participants && state.participants.length > 0) {
      this._participants = state.participants;
      this._activeIndex = state.activeIndex || 0;
      this._movementLocked = state.movementLocked || false;
    } else {
      this._participants = [this._generateGMParticipant()];
      this._activeIndex = 0;
      this._movementLocked = false;
    }
  }

  async _saveState() {
    if (!game.user.isGM) return;
    await game.settings.set("shadowdark-crawl-tracker", "trackerState", {
      participants: this._participants,
      activeIndex: this._activeIndex,
      movementLocked: this._movementLocked
    });
  }

  async _onNextTurn(event, target) {
    if (!game.user.isGM) return;
    this._activeIndex = (this._activeIndex + 1) % this._participants.length;
    await this._saveState();
    this.render();
  }

  async _onResetTracker(event, target) {
    if (!game.user.isGM) return;
    this._participants = [this._generateGMParticipant()];
    this._activeIndex = 0;
    // Save state FIRST so that when render calls _loadState, it gets the reset version
    await this._saveState();
    this.render();
  }

  async _onMoveUp(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.id;
    const index = this._participants.findIndex(p => p.id === id);
    if (index > 0) {
      const temp = this._participants[index];
      this._participants[index] = this._participants[index - 1];
      this._participants[index - 1] = temp;

      // Adjust active index if it moved
      if (this._activeIndex === index) this._activeIndex--;
      else if (this._activeIndex === index - 1) this._activeIndex++;

      await this._saveState();
      this.render();
    }
  }

  async _onMoveDown(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.id;
    const index = this._participants.findIndex(p => p.id === id);
    if (index < this._participants.length - 1) {
      const temp = this._participants[index];
      this._participants[index] = this._participants[index + 1];
      this._participants[index + 1] = temp;

      // Adjust active index
      if (this._activeIndex === index) this._activeIndex++;
      else if (this._activeIndex === index + 1) this._activeIndex--;

      await this._saveState();
      this.render();
    }
  }

  async _onRefresh(event, target) {
    if (!game.user.isGM) return;
    this.render();
  }

  async _onToggleLock(event, target) {
    if (!game.user.isGM) return;
    this._movementLocked = !this._movementLocked;
    await this._saveState();
    await this._saveState();
    this.render();
  }

  async _onToggleCombatLock(event, target) {
    if (!game.user.isGM) return;
    const newState = !game.settings.get("shadowdark-crawl-tracker", "combatMovementLock");
    await game.settings.set("shadowdark-crawl-tracker", "combatMovementLock", newState);
    this.render();
  }
}

// Register settings
Hooks.once("init", () => {
  console.log("Shadowdark Crawl Tracker | Initializing Version 1.2.0");

  game.settings.register("shadowdark-crawl-tracker", "trackerState", {
    name: "Tracker State",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register("shadowdark-crawl-tracker", "combatMovementLock", {
    name: "Combat Movement Lock",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  const api = new CrawlTracker();
  game.modules.get("shadowdark-crawl-tracker").api = {
    tracker: api
  };
});

// Movement Lock Hook
// Prevent movement if it's not the user's turn
Hooks.on("preUpdateToken", (doc, changes, options, userId) => {
  // If no movement change, ignore
  if (!changes.x && !changes.y) return true;

  // GM can always move
  if (game.user.isGM) return true;

  // --- COMBAT MOVEMENT LOCK ---
  if (game.combat?.active) {
    const combatLock = game.settings.get("shadowdark-crawl-tracker", "combatMovementLock");
    if (combatLock) {
      const currentCombatant = game.combat.combatant;
      // If no combatant is active, maybe lock everyone? Or allow?
      // Usually there is always a current combatant if active.
      if (currentCombatant && currentCombatant.actorId !== doc.actor.id) {
        ui.notifications.warn(`It is ${currentCombatant.name}'s turn!`);
        return false;
      }
    }
    // If we are in combat, IGNORE the Crawl Tracker lock completely.
    return true;
  }

  // --- CRAWL TRACKER LOCK ---
  // Only applies if NOT in combat (handled above)
  const state = game.settings.get("shadowdark-crawl-tracker", "trackerState");
  if (!state || !state.movementLocked) return true;

  const participants = state.participants || [];
  const activeIndex = state.activeIndex || 0;
  const activeParticipant = participants[activeIndex];

  if (!activeParticipant) return true;

  // The active participant's actor ID
  const allowedActorId = activeParticipant.actorId;

  // The actor associated with the moving token
  const tokenActorId = doc.actor.id;

  if (activeParticipant.isGM) {
    // If it's GM's turn, players cannot move
    ui.notifications.warn("It is the GM's turn!");
    return false;
  }

  if (allowedActorId !== tokenActorId) {
    ui.notifications.warn(`It is ${activeParticipant.name}'s turn!`);
    return false;
  }

  return true;
});

// Auto-update participants if actors change (name/img)
Hooks.on("updateSetting", (setting) => {
  if (setting.key === "shadowdark-crawl-tracker.trackerState") {
    const api = game.modules.get("shadowdark-crawl-tracker").api;
    if (api && api.tracker && api.tracker.rendered) {
      api.tracker.render();
    }
  }
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (!game.user.isGM) return;
  // Only care if name or img changed
  if (!changes.name && !changes.img) return;

  const state = game.settings.get("shadowdark-crawl-tracker", "trackerState");
  const participants = state.participants || [];
  let changed = false;

  // Check if this actor is in our list
  for (const p of participants) {
    if (p.actorId === actor.id) {
      if (changes.name) p.name = changes.name;
      if (changes.img) p.img = changes.img;
      changed = true;
    }
  }

  if (changed) {
    await game.settings.set("shadowdark-crawl-tracker", "trackerState", state);
    const api = game.modules.get("shadowdark-crawl-tracker").api;
    if (api && api.tracker) api.tracker.render();
  }
});

Hooks.on("renderSceneControls", (app, html, data) => {
  if (!game.user.isGM) return;

  // Ensure html is a jQuery object
  const jqHtml = $(html);

  // Fix deprecation warnings & get active state safely
  // V13+ uses app.control.name/app.tool.name
  const activeControlName = app.control?.name || app.activeControl;

  // We want to add the button when the Token controls are active
  if (activeControlName === "token" || activeControlName === "tokens") {
    // In V13, the tools menu has the ID 'scene-controls-tools'
    const toolsMenu = jqHtml.find("#scene-controls-tools");

    // Fallback logic
    const targetContainer = toolsMenu.length ? toolsMenu : jqHtml.find(".sub-controls.active");

    if (targetContainer.length) {
      if (targetContainer.find('.control-tool[data-tool="toggle-tracker"]').length > 0) return;

      const title = "Toggle Crawl Tracker";
      const icon = "fa-solid fa-shoe-prints";

      const btn = $(`
        <li class="control-tool" data-tool="toggle-tracker" aria-label="${title}">
          <button type="button" class="control ui-control tool icon ${icon}" data-tool="toggle-tracker" aria-label="${title}"></button>
        </li>
      `);

      btn.on("click", (event) => {
        event.preventDefault();
        try {
          const api = game.modules.get("shadowdark-crawl-tracker").api;
          if (api?.tracker) {
            if (api.tracker.rendered) api.tracker.close();
            else api.tracker.render({ force: true });
          }
        } catch (err) {
          console.error("Shadowdark Crawl Tracker | Error rendering tracker:", err);
        }
      });

      targetContainer.append(btn);
    }
  }
});
