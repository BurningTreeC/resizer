/*\
title: $:/plugins/BTC/resizer/modules/widgets/resizer.js
type: application/javascript
module-type: widget

Resizer widget for resizing elements

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

// Global manager for document-level event listeners shared across all resizer instances

var ResizerWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ResizerWidget.prototype = new Widget();

/*
Shared utility methods for all resizer instances
*/

// Get viewport dimensions with high precision

/*
Install compatibility modules.

The widget shell intentionally stays tiny. Each module mutates the same
ResizerWidget prototype, so existing call sites, attributes and behaviours
remain compatible with the original monolithic widget.
*/
require("$:/plugins/BTC/resizer/modules/utils/units.js").install(ResizerWidget);
require("$:/plugins/BTC/resizer/modules/utils/feature-adapters.js").install(ResizerWidget);
require("$:/plugins/BTC/resizer/modules/widgets/resizer-render.js").install(ResizerWidget);
require("$:/plugins/BTC/resizer/modules/interactions/event-handlers.js").install(ResizerWidget);
require("$:/plugins/BTC/resizer/modules/widgets/resizer-lifecycle.js").install(ResizerWidget, Widget);
require("$:/plugins/BTC/resizer/modules/interactions/grid-track.js").install(ResizerWidget);

exports.resizer = ResizerWidget;
