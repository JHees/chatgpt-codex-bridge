/** Scoped native-token styling; no dependency on another plugin or App class names. */
export const bridgeStyle = `
.bridge-controls{--bridge-fg:var(--color-text,CanvasText);--bridge-muted:var(--color-text-secondary,GrayText);--bridge-bg:var(--color-background-surface,Canvas);--bridge-border:var(--color-border,ButtonBorder);--bridge-hover:var(--color-token-bg-secondary,ButtonFace);box-sizing:border-box;min-width:0;font:var(--text-sm,13px)/1.5 var(--font-sans,system-ui);color:var(--bridge-fg)}
.bridge-controls *{box-sizing:border-box}
.bridge-controls button,.bridge-controls select,.bridge-controls input{font:inherit;color:inherit;max-width:100%}
.bridge-controls button{cursor:pointer}.bridge-controls button:disabled{opacity:.5;cursor:default}
.bridge-controls :focus-visible{outline:2px solid var(--color-border-focus,Highlight);outline-offset:2px}
.bridge-controls button,.bridge-controls select,.bridge-controls input[type=number]{border:1px solid var(--bridge-border);border-radius:9px;background:var(--bridge-bg);padding:5px 10px;min-width:0}
.bridge-controls button:hover{background:var(--bridge-hover)}
.bridge-controls input[role=switch]{appearance:none;position:relative;width:32px;height:18px;margin:0;padding:0;border:1px solid transparent;border-radius:999px;background:color-mix(in srgb,var(--bridge-fg) 22%,var(--bridge-bg));cursor:pointer;flex:none;transition:background .12s}
.bridge-controls input[role=switch]::before{content:"";position:absolute;width:14px;height:14px;left:1px;top:1px;border-radius:50%;background:white;box-shadow:0 1px 2px #0003;transition:transform .12s}
.bridge-controls input[role=switch]:checked{background:var(--color-border-focus,Highlight)}
.bridge-controls input[role=switch]:checked::before{transform:translateX(14px)}
@media(prefers-reduced-motion:reduce){.bridge-controls input[role=switch],.bridge-controls input[role=switch]::before{transition:none}}
@media(forced-colors:active){.bridge-controls input[role=switch]{forced-color-adjust:none;background:Canvas;border-color:ButtonText}.bridge-controls input[role=switch]::before{background:ButtonText}.bridge-controls input[role=switch]:checked{background:Highlight}.bridge-controls input[role=switch]:checked::before{background:HighlightText}}
.bridge-settings{display:block!important;width:100%;max-width:768px;margin:0 auto;padding:0 0 32px}
.bridge-settings h2{font-size:var(--text-heading-lg,24px);font-weight:500;line-height:1.3;margin:0 0 28px}
.bridge-settings h3{font-size:13px;font-weight:500;line-height:1.5;margin:32px 0 16px}.bridge-settings form>h3:first-child{margin-top:0}
.bridge-settings p{margin:0;color:var(--bridge-muted);overflow-wrap:anywhere}
.bridge-settings .bridge-group{border:1px solid var(--bridge-border);border-radius:20px;padding:0 16px}
.bridge-settings .bridge-row{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:56px;padding:12px 0}
.bridge-settings .bridge-row+.bridge-row{border-top:1px solid var(--bridge-border)}
.bridge-row-copy{display:grid;gap:2px;min-width:0;flex:1}.bridge-row-title{font-weight:500}.bridge-row-description{font-size:13px;line-height:1.43;color:var(--bridge-muted);font-weight:400}
.bridge-settings .bridge-row select{width:auto;max-width:250px;flex:0 1 auto}.bridge-settings .bridge-row input[type=number]{width:76px;text-align:right;flex:none}
.bridge-settings .bridge-save-status{font-size:12px;margin-top:12px;min-height:18px}
.bridge-settings .bridge-note{font-size:12px;color:var(--bridge-muted);margin:12px 0}
.bridge-settings [data-bridge-error]:empty,.bridge-settings [data-bridge-background]:empty,.bridge-popover [role=status]:empty{display:none}
.bridge-settings .bridge-diagnostics{margin-top:28px;display:grid;gap:12px}
.bridge-settings .bridge-diagnostics h3{margin:0 0 4px}
.bridge-settings .bridge-diagnostics button{width:auto;flex:none;white-space:nowrap}
.bridge-compact{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-color:transparent!important;border-radius:999px!important;background:transparent!important;padding:4px 8px!important;height:28px;color:var(--bridge-muted)!important}
.bridge-compact:hover,.bridge-compact[aria-expanded=true]{background:var(--bridge-hover)!important;color:var(--bridge-fg)!important}
.bridge-popover,.bridge-submenu{position:fixed;z-index:2147483000;width:260px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;background:var(--color-surface-elevated,var(--bridge-bg));border:1px solid var(--bridge-border);border-radius:16px;padding:6px;box-shadow:0 5px 20px #00000014,0 1px 4px #0000000a}
.bridge-submenu{width:200px;z-index:2147483001}
.bridge-controls .bridge-model-row{display:flex;align-items:center;gap:12px;width:100%;min-height:34px;text-align:left;border:0;background:transparent;border-radius:9px;padding:7px 8px;white-space:normal}
.bridge-model-row>span:first-child{flex:1;min-width:0;overflow-wrap:anywhere}.bridge-model-row svg{flex:none}
.bridge-model-row:hover,.bridge-model-row[aria-expanded=true]{background:var(--bridge-hover)}
.bridge-model-row[aria-checked=true]{font-weight:500}.bridge-model-caption{color:var(--bridge-muted);font-size:12px;white-space:nowrap}
.bridge-menu-heading{font-size:12px;font-weight:500;color:var(--bridge-muted);padding:7px 8px 4px}
.bridge-controls .bridge-menu-note{font-size:11px;line-height:1.5;color:var(--bridge-muted);padding:6px 8px 4px;margin:4px 0 0;border-top:1px solid var(--bridge-border)}
.bridge-controls .bridge-preset-trigger{display:flex;align-items:center;gap:8px;max-width:270px;text-align:right;flex-shrink:0;padding:5px 8px}.bridge-preset-trigger svg{flex:none}
.bridge-popover .bridge-quick-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;padding:4px 8px;border-radius:9px}
.bridge-popover .bridge-quick-row select{max-width:190px;padding:3px 7px;font-size:12px;background:transparent;border-color:transparent;text-align-last:right}
.bridge-popover .bridge-quick-row:hover{background:var(--bridge-hover)}
.bridge-popover .bridge-quick-divider{border-top:1px solid var(--bridge-border);margin:5px 4px}
.bridge-popover .bridge-quick-footer{display:flex;align-items:center;justify-content:space-between;padding:2px 4px}
.bridge-popover .bridge-quick-footer button{border:0;background:transparent;font-size:12px;color:var(--bridge-muted);padding:5px 6px}
.bridge-popover .bridge-quick-state{font-size:12px;color:var(--bridge-muted);padding:4px 8px;overflow-wrap:anywhere}
.bridge-popover .bridge-actions{display:flex;flex-wrap:wrap;gap:4px;padding:4px}
.bridge-popover .bridge-actions button{font-size:12px;padding:4px 7px}
@media(max-width:560px){.bridge-settings .bridge-row{gap:12px;flex-wrap:wrap}.bridge-settings .bridge-row select{max-width:100%}.bridge-settings h2{font-size:22px}.bridge-settings .bridge-group{padding:0 12px}.bridge-row-copy{min-width:140px}}
`;
