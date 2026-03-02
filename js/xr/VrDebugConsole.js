// js/xr/VrDebugConsole.js
export function registerVrDebugConsole(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  AFRAME.registerComponent("vr-debug-console", {
    schema: {
      maxLines: { type: "int", default: 18 },
      width: { type: "number", default: 1.15 },
      height: { type: "number", default: 0.55 },
      // 🔥 250% maior (2.5x)
      fontSize: { type: "number", default: 0.1375 }
    },

    init() {
      this.lines = [];
      this._orig = null;

      // painel
      const bg = document.createElement("a-plane");
      bg.setAttribute("width", this.data.width);
      bg.setAttribute("height", this.data.height);
      bg.setAttribute("material", "color:#000; opacity:0.75; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      bg.setAttribute("position", "0 0 0");
      this.el.appendChild(bg);

      // texto
      const text = document.createElement("a-entity");
      text.setAttribute("text", [
        "value:VR DEBUG CONSOLE",
        "color:#fff",
        "align:left",
        "baseline:top",
        "anchor:left",
        `width:${this.data.width * 1.8}`,
        `wrapCount:${Math.floor(this.data.width * 30)}`
      ].join(";"));

      text.setAttribute(
        "position",
        `${(-this.data.width / 2) + 0.03} ${(this.data.height / 2) - 0.04} 0.01`
      );

      text.setAttribute(
        "scale",
        `${this.data.fontSize} ${this.data.fontSize} ${this.data.fontSize}`
      );

      this.el.appendChild(text);
      this._textEl = text;

      this._hookConsole();
      this._hookErrors();

      this._append("vr_debug: ON");
    },

    remove() {
      this._unhookConsole();
      this._unhookErrors();
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

    _hookConsole() {
      if (this._orig) return;

      this._orig = {
        log: console.log,
        warn: console.warn,
        error: console.error
      };

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
