// js/xr/VrDebugConsole.js
export function registerVrDebugConsole(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  AFRAME.registerComponent("vr-debug-console", {
    schema: {
      maxLines: { type: "int", default: 18 },
      width: { type: "number", default: 1.15 },
      height: { type: "number", default: 0.55 },
      fontSize: { type: "number", default: 0.055 },

      // ✅ novo: liga/desliga interação de verdade
      interactive: { type: "boolean", default: true }
    },

    init() {
      this.lines = [];
      this._orig = null;

      this._FONT_BOOST = 6.0;

      const bg = document.createElement("a-plane");
      bg.setAttribute("width", this.data.width);
      bg.setAttribute("height", this.data.height);
      bg.setAttribute(
        "material",
        "color:#000; opacity:0.75; transparent:true; shader:flat; depthTest:false; depthWrite:false"
      );
      bg.setAttribute("position", "0 0 0");
      this.el.appendChild(bg);

      const text = document.createElement("a-entity");
      text.setAttribute("text", [
        "value:VR DEBUG CONSOLE",
        "color:#fff",
        "align:left",
        "baseline:top",
        "anchor:left",
        `width:${this.data.width * 1.0}`,
        `wrapCount:${Math.floor(this.data.width * 42)}`
      ].join(";"));

      text.setAttribute(
        "position",
        `${(-this.data.width / 2) + 0.03} ${(this.data.height / 2) - 0.04} 0.01`
      );

      this.el.appendChild(text);
      this._textEl = text;

      this._makeCopyButton();

      this._hookConsole();
      this._hookErrors();
      this._append("vr_debug: ON");

      this._applyFontScale(true);

      const reapply = () => this._applyFontScale(false);
      text.addEventListener("object3dset", reapply);
      this.el.addEventListener("loaded", reapply);

      // ✅ aplica estado de interação já no init
      this._applyInteractive();
    },

    update() {
      this._applyFontScale(true);
      this._applyInteractive();
    },

    tick() {
      this._applyFontScale(false);
      // ✅ garante que não reativa clickables sozinho
      this._applyInteractive();
    },

    remove() {
      this._unhookConsole();
      this._unhookErrors();
    },

    getLogText() {
      return this.lines.join("\n");
    },

    _effectiveFontScale() {
      const base = Number(this.data.fontSize) || 0.055;
      const effective = base * this._FONT_BOOST;
      return Math.max(0.6, effective);
    },

    _applyFontScale(forceLog) {
      const t = this._textEl;
      if (!t || !t.object3D) return;

      const s = this._effectiveFontScale();
      const cur = t.object3D.scale.x;

      if (Math.abs(cur - s) > 1e-4) {
        t.object3D.scale.set(s, s, s);
        t.setAttribute("scale", `${s} ${s} ${s}`);
        if (forceLog) console.log(`[vr-debug-console] fontScale efetivo=${s.toFixed(3)} (base=${this.data.fontSize})`);
      }
    },

    _applyInteractive() {
      const enabled = !!this.data.interactive && this.el.getAttribute("visible") !== false && this.el.object3D?.visible !== false;

      if (this._copyBtn) {
        if (enabled) this._copyBtn.classList.add("clickable");
        else this._copyBtn.classList.remove("clickable");
      }
    },

    _append(msg) {
      const s = String(msg ?? "");
      const stamped = `[${new Date().toLocaleTimeString()}] ${s}`;
      this.lines.push(stamped);
      while (this.lines.length > this.data.maxLines) this.lines.shift();
      this._render();
    },

    _render() {
      if (!this._textEl) return;
      this._textEl.setAttribute("text", "value", this.lines.join("\n"));
    },

    _makeCopyButton() {
      // ✅ pequeno, canto direito, só ícone 📋
      const w = 0.10;
      const h = 0.10;

      const btn = document.createElement("a-plane");
      btn.classList.add("clickable");
      btn.setAttribute("width", w);
      btn.setAttribute("height", h);

      // canto superior direito do painel
      const x = (this.data.width / 2) - (w / 2) - 0.03;
      const y = (this.data.height / 2) - (h / 2) - 0.03;

      btn.setAttribute("position", `${x} ${y} 0.012`);
      btn.setAttribute("material", "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false");

      const label = document.createElement("a-entity");
      label.setAttribute("text", [
        "value:📋",
        "color:#fff",
        "align:center",
        "baseline:center",
        "anchor:center",
        "width:0.6"
      ].join(";"));
      label.setAttribute("position", "0 0 0.01");
      label.setAttribute("scale", "0.28 0.28 0.28");
      btn.appendChild(label);

      btn.addEventListener("click", async (e) => {
        e?.stopPropagation?.();

        // ✅ se estiver “invisível”/não interativo, IGNORA
        if (!this.data.interactive) return;
        if (this.el.getAttribute("visible") === false) return;
        if (this.el.object3D && this.el.object3D.visible === false) return;

        try {
          await navigator.clipboard.writeText(this.getLogText());
          this._append("OK: log copiado");
        } catch {
          this._append("ERR: clipboard falhou");
        }
      });

      this.el.appendChild(btn);
      this._copyBtn = btn;
    },

    _hookConsole() {
      if (this._orig) return;

      this._orig = { log: console.log, warn: console.warn, error: console.error };
      console.log = (...a) => { this._orig.log(...a); this._append(a.join(" ")); };
      console.warn = (...a) => { this._orig.warn(...a); this._append("WARN: " + a.join(" ")); };
      console.error = (...a) => { this._orig.error(...a); this._append("ERR: " + a.join(" ")); };
    },

    _unhookConsole() {
      if (!this._orig) return;
      console.log = this._orig.log;
      console.warn = this._orig.warn;
      console.error = this._orig.error;
      this._orig = null;
    },

    _hookErrors() {
      this._onErr = (e) => {
        const m = e?.message || e?.error?.message || "window.onerror";
        this._append("ERR: " + m);
      };
      this._onRej = (e) => {
        const m = e?.reason?.message || String(e?.reason ?? "unhandledrejection");
        this._append("REJ: " + m);
      };

      window.addEventListener("error", this._onErr);
      window.addEventListener("unhandledrejection", this._onRej);
    },

    _unhookErrors() {
      if (this._onErr) window.removeEventListener("error", this._onErr);
      if (this._onRej) window.removeEventListener("unhandledrejection", this._onRej);
      this._onErr = null;
      this._onRej = null;
    }
  });
}