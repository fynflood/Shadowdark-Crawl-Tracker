/**
 * Shadowdark Crawl Initiative Tracker
 * A non-combat turn-taking application for Shadowdark RPG.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CrawlTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this._participants = [];
    this._activeIndex = 0;
    this._movementLocked = false;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "shadowdark-crawl-tracker",
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
      toggleLock: CrawlTracker.prototype._onToggleLock
    }
  };

  static PARTS = {
    tracker: {
      template: "modules/shadowdark-crawl-tracker/templates/crawl-tracker.hbs"
    }
  };

  /** @override */
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

    console.log(`Shadowdark Crawl Tracker | Searching for players... Found ${playerActors.length} candidates.`);

    for (const actor of playerActors) {
      if (!this._participants.some(p => p.actorId === actor.id)) {
        console.log(`Shadowdark Crawl Tracker | Adding player: ${actor.name}`);
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
      if (!exists) console.log(`Shadowdark Crawl Tracker | Removing missing actor: ${p.name}`);
      return exists;
    });

    return {
      participants: this._participants,
      activeIndex: this._activeIndex,
      isGM: game.user.isGM,
      movementLocked: this._movementLocked
    };
  }

  _generateGMParticipant() {
    return {
      id: "gm-participant",
      name: "Game Master",
      img: "icons/svg/mystery-man.svg",
      isGM: true,
      actorId: null
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

  // --- Actions ---

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

      // Adjust active index if it moved
      if (this._activeIndex === index) this._activeIndex++;
      else if (this._activeIndex === index + 1) this._activeIndex--;

      await this._saveState();
      this.render();
    }
  }

  async _onRefresh(event, target) {
    this.render();
  }

  async _onToggleLock(event, target) {
    if (!game.user.isGM) return;
    this._movementLocked = !this._movementLocked;
    await this._saveState();
    this.render();
  }
}

/**
 * Initialize Module
 */
Hooks.once("init", () => {
  console.log("Shadowdark Crawl Tracker | Initializing Version 1.1.0");
  game.settings.register("shadowdark-crawl-tracker", "trackerState", {
    name: "Tracker State",
    scope: "world",
    config: false,
    type: Object,
    default: { participants: [], activeIndex: 0, movementLocked: false }
  });

  game.modules.get("shadowdark-crawl-tracker").api = {
    tracker: new CrawlTracker()
  };
});

Hooks.on("preUpdateToken", (document, change, options, userId) => {
  // 1. GM always bypasses
  if (game.user.isGM) return true;

  // 2. Read state directly from settings (Source of Truth) to avoid stale client state
  console.log("Shadowdark Crawl Tracker | Checking lock state from settings");
  const state = game.settings.get("shadowdark-crawl-tracker", "trackerState");
  if (!state || !state.movementLocked) return true;

  // 3. Check if the change involves position (x or y)
  const isMoving = (change.x !== undefined && change.x !== document.x) || (change.y !== undefined && change.y !== document.y);
  if (!isMoving) return true;

  // 4. Check if the token belongs to the active participant
  const participants = state.participants;
  const activeIndex = state.activeIndex;

  if (participants && participants[activeIndex]) {
    const activeParticipant = participants[activeIndex];

    // If the token matches the active participant's actor ID, ALLOW movement
    if (activeParticipant && activeParticipant.actorId === document.actorId) {
      return true; // IT IS YOUR TURN
    }
  }

  ui.notifications.warn("Crawl Initiative: Movement is waiting for your turn.");
  return false; // Prevent the update for everyone else
});

Hooks.on("updateSetting", (setting, change, options, userId) => {
  if (setting.key === "shadowdark-crawl-tracker.trackerState") {
    const api = game.modules.get("shadowdark-crawl-tracker").api;
    if (api && api.tracker) {
      // Reload the new state into the class instance
      api.tracker._loadState().then(() => {
        api.tracker.render();
      });
    }
  }
});

Hooks.on("updateActor", (actor, changes, options, userId) => {
  // Only care if name or img changed
  if (!changes.name && !changes.img) return;

  const api = game.modules.get("shadowdark-crawl-tracker").api;
  if (api && api.tracker) {
    const tracker = api.tracker;
    const participant = tracker._participants.find(p => p.actorId === actor.id);
    if (participant) {
      if (changes.name) participant.name = changes.name;
      if (changes.img) participant.img = changes.img;
      tracker.render();
      // We should probably save state here too if we want it to persist immediately, 
      // though usually save happens on turn change. Let's save to be safe.
      if (game.user.isGM) tracker._saveState();
    }
  }
});

Hooks.on("getSceneControlButtons", (controls) => {
  // Add a new primary category for Crawl Tracking
  const crawlControl = {
    name: "shadowdark-crawl",
    title: "Crawl Tracking",
    layer: "tokens",
    icon: "fa-solid fa-shoe-prints",
    visible: true,
    tools: {
      "toggle-tracker": {
        name: "toggle-tracker",
        title: "Toggle Crawl Tracker",
        icon: "fa-solid fa-shoe-prints",
        onClick: () => {
          console.log("Shadowdark Crawl Tracker | Toggle Button Clicked");
          try {
            const api = game.modules.get("shadowdark-crawl-tracker").api;
            if (!api || !api.tracker) {
              console.error("Shadowdark Crawl Tracker | API or Tracker not found!");
              return;
            }
            if (api.tracker.rendered) {
              api.tracker.close();
            } else {
              api.tracker.render({ force: true });
            }
          } catch (err) {
            console.error("Shadowdark Crawl Tracker | Error rendering tracker:", err);
          }
        },
        button: true
      }
    },
    activeTool: "toggle-tracker"
  };

  // In V13, controls is a Record<string, SceneControl>
  controls["shadowdark-crawl"] = crawlControl;
});
