/*\
title: $:/plugins/BTC/resizer/modules/utils/global-manager.js
type: application/javascript
module-type: library

Shared document-level pointer listener manager for BTC resizer widgets.
\*/

/*jslint node: true, browser: true */
/*global document: false */
"use strict";

var GlobalResizerManager = {
	documentListenersAdded: false,
	activeWidgets: [],
	handlePointerMove: null,
	handlePointerUp: null,
	referenceCount: 0,

	addWidget: function(widget) {
		if(this.activeWidgets.indexOf(widget) === -1) {
			this.activeWidgets.push(widget);
			this.referenceCount++;
		}
		this.ensureDocumentListeners();
	},

	removeWidget: function(widget) {
		var index = this.activeWidgets.indexOf(widget);
		if(index > -1) {
			this.activeWidgets.splice(index, 1);
			this.referenceCount--;
		}
		if(this.referenceCount <= 0) {
			this.referenceCount = 0;
			this.activeWidgets = [];
			this.removeDocumentListeners();
		}
	},

	ensureDocumentListeners: function() {
		if(!this.documentListenersAdded && typeof document !== "undefined") {
			var self = this;

			this.handlePointerMove = function(event) {
				for(var i = 0; i < self.activeWidgets.length; i++) {
					var widget = self.activeWidgets[i];
					if(widget.handlePointerMoveGlobal) {
						widget.handlePointerMoveGlobal(event);
					}
				}
			};

			this.handlePointerUp = function(event) {
				for(var i = 0; i < self.activeWidgets.length; i++) {
					var widget = self.activeWidgets[i];
					if(widget.handlePointerUpGlobal) {
						widget.handlePointerUpGlobal(event);
					}
				}
			};

			document.addEventListener("pointermove", this.handlePointerMove, {passive: false});
			document.addEventListener("pointerup", this.handlePointerUp, {passive: false});
			document.addEventListener("pointercancel", this.handlePointerUp, {passive: false});
			this.documentListenersAdded = true;
		}
	},

	removeDocumentListeners: function() {
		if(this.documentListenersAdded && typeof document !== "undefined") {
			if(this.handlePointerMove) {
				document.removeEventListener("pointermove", this.handlePointerMove);
			}
			if(this.handlePointerUp) {
				document.removeEventListener("pointerup", this.handlePointerUp);
				document.removeEventListener("pointercancel", this.handlePointerUp);
			}
			this.documentListenersAdded = false;
			this.handlePointerMove = null;
			this.handlePointerUp = null;
		}
	}
};

exports.GlobalResizerManager = GlobalResizerManager;
