(function (window, document) {
  "use strict";

  function Bucksbox(options = {}) {
    if (!options.order_id) throw new Error("Bucksbox: order_id required");
    if (!options.token) throw new Error("Bucksbox: token required");

    const order_id = String(options.order_id);
    const token = String(options.token);
    const env = options.env === "sandbox" ? "sandbox" : "live";
    const baseURL =
      env === "live" ? "https://pay.bucksbox.in" : (options.localUrl || "http://localhost:3010");
    const timeoutMs = options.timeout || 120000;

    let wrapper, iframe, closeBtn, spinner;
    let opened = false;
    let timeoutHandle = null;

    // --- Inject style only once ---
    if (!document.getElementById("bucksbox-style")) {
      const style = document.createElement("style");
      style.id = "bucksbox-style";
      style.textContent = `
        /* Wrapper covers full screen */
        .bucksbox_wrapper {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 2147483647;
          justify-content: center;
          align-items: center;
          transition: opacity 0.3s ease;
          opacity: 0;
        }
        .bucksbox_wrapper.show {
          display: flex;
          opacity: 1;
        }

        /* Modal box */
        .bucksbox_modal {
          position: relative;
          width: 100%;
          max-width: 480px;
          height: 90vh;
          background: #fff;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        /* iframe takes all remaining space */
        #bucksbox_iframe {
          flex: 1;
          border: none;
          width: 100%;
          height: 100%;
          background: transparent;
        }

        /* Spinner overlay */
        .bucksbox_spinner {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(255,255,255,0.9);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          color: #333;
          box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }

        /* Close button */
        .bucksbox_close {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 32px;
          height: 32px;
          background: rgba(0,0,0,0.6);
          color: white;
          border: none;
          border-radius: 50%;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .bucksbox_close:hover {
          background: rgba(0,0,0,0.8);
        }

        /* Mobile full screen */
        @media (max-width: 700px) {
          .bucksbox_modal {
            width: 100%;
            height: 100%;
            max-height: 100%;
            border-radius: 0;
          }
          .bucksbox_close {
            background: rgba(255,255,255,0.8);
            color: #111;
            top: 16px;
            right: 16px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // --- Build modal structure ---
    wrapper = document.createElement("div");
    wrapper.className = "bucksbox_wrapper";
    wrapper.setAttribute("aria-hidden", "true");

    const modal = document.createElement("div");
    modal.className = "bucksbox_modal";

    closeBtn = document.createElement("button");
    closeBtn.className = "bucksbox_close";
    closeBtn.innerHTML = "&times;";
    closeBtn.title = "Close";

    spinner = document.createElement("div");
    spinner.className = "bucksbox_spinner";
    spinner.textContent = "Loading payment...";

    iframe = document.createElement("iframe");
    iframe.id = "bucksbox_iframe";
    iframe.src = "about:blank";
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-popups");

    modal.appendChild(closeBtn);
    modal.appendChild(spinner);
    modal.appendChild(iframe);
    wrapper.appendChild(modal);
    document.body.appendChild(wrapper);

    // --- Open function ---
    function open() {
      if (opened) return;
      opened = true;
      wrapper.classList.add("show");
      wrapper.setAttribute("aria-hidden", "false");
      spinner.style.display = "block";

      const url = `${baseURL}/api/sdk/pay/${order_id}?token=${token}&platform=web`;
      iframe.src = url;

      iframe.onload = () => {
        spinner.style.display = "none";
      };

      timeoutHandle = setTimeout(() => {
        close();
        alert("Payment session timed out.");
      }, timeoutMs);
    }

    // --- Close function ---
    function close() {
      if (!opened) return;
      opened = false;
      wrapper.classList.remove("show");
      wrapper.setAttribute("aria-hidden", "true");
      iframe.src = "about:blank";
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    // --- Button actions ---
    closeBtn.addEventListener("click", close);
    wrapper.addEventListener("click", (e) => {
      if (e.target === wrapper) close();
    });

    // --- Responsive height fix ---
    window.addEventListener("resize", () => {
      iframe.style.height = `${window.innerHeight * 0.9}px`;
    });

    return { open, close };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Bucksbox;
  } else {
    window.Bucksbox = Bucksbox;
  }
})(window, document);
