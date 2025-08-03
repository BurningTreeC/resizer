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

var ResizerWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ResizerWidget.prototype = new Widget();

/*
Static overlay management - singleton pattern
*/
ResizerWidget.overlayInstance = null;
ResizerWidget.getOverlay = function(document) {
	if(!ResizerWidget.overlayInstance || !document.body.contains(ResizerWidget.overlayInstance)) {
		ResizerWidget.overlayInstance = document.createElement("div");
		ResizerWidget.overlayInstance.className = "tc-resize-overlay";
		document.body.insertBefore(ResizerWidget.overlayInstance, document.body.firstChild);
	}
	return ResizerWidget.overlayInstance;
};

/*
Render this widget into the DOM
*/
ResizerWidget.prototype.render = function(parent,nextSibling) {
	// Save the parent dom node
	this.parentDomNode = parent;
	// Compute our attributes
	this.computeAttributes();
	// Execute our logic
	this.execute();
	// Create our element
	var domNode = this.document.createElement("div");
	domNode.className = "tc-resizer " + (this.resizerClass || "") + (this.disable === "yes" ? " tc-resizer-disabled" : "");
	domNode.setAttribute("data-direction", this.direction);
	domNode.setAttribute("data-handle-position", this.handlePosition);
	if(this.disable === "yes") {
		domNode.setAttribute("data-disabled", "true");
	}
	// Add event handlers only if not disabled
	if(this.disable !== "yes") {
		this.addEventHandlers(domNode);
	}
	// Insert element based on handle position
	try {
		if(this.handlePosition === "before" && this.targetElement && parent[this.targetElement]) {
			var target = parent[this.targetElement];
			target.parentNode.insertBefore(domNode, target);
		} else if(this.handlePosition === "overlay") {
			// For overlay mode, we'll position it absolutely over the target
			domNode.style.position = "absolute";
			parent.insertBefore(domNode,nextSibling);
		} else {
			// Default "after" behavior
			parent.insertBefore(domNode,nextSibling);
		}
	} catch(e) {
		// Fallback to default insertion if custom insertion fails
		console.error("Error inserting resizer element:", e);
		parent.insertBefore(domNode,nextSibling);
	}
	this.renderChildren(domNode,null);
	this.domNodes.push(domNode);
};

/*
Add event handlers to the resizer
*/
ResizerWidget.prototype.addEventHandlers = function(domNode) {
	var self = this;
	var isResizing = false;
	
	// Store cleanup function reference on the widget
	self.cleanupResize = null;
	var startX = 0;
	var startY = 0;
	var startValue = 0;
	var startValues = {}; // Object to store initial values for each tiddler (in pixels)
	var startUnits = {}; // Object to store original units for each tiddler
	var targetElement = null;
	var targetElements = [];
	var initialMouseX = 0;
	var initialMouseY = 0;
	var parentSizeAtStart = 0;
	var aspectRatioValue = null;
	var effectiveMinValue = null;
	var effectiveMaxValue = null;
	var animationFrameId = null;
	var pendingMouseEvent = null;
	
	// Parse aspect ratio
	if(self.aspectRatio) {
		if(self.aspectRatio.indexOf(":") > -1) {
			var parts = self.aspectRatio.split(":");
			aspectRatioValue = parseFloat(parts[0]) / parseFloat(parts[1]);
		} else {
			aspectRatioValue = parseFloat(self.aspectRatio);
		}
	}
	
	// Helper to get numeric value from a string with units
	var getNumericValue = function(value) {
		return parseFloat(value) || 0;
	};
	
	// Helper to detect the unit of a value
	var getUnit = function(value) {
		if(typeof value !== "string") return "px";
		if(value.endsWith("%")) return "%";
		if(value.endsWith("px")) return "px";
		if(value.endsWith("em")) return "em";
		if(value.endsWith("rem")) return "rem";
		if(value.endsWith("vh")) return "vh";
		if(value.endsWith("vw")) return "vw";
		// If no unit specified, assume pixels
		return "px";
	};
	
	// Helper to convert percentage to pixels based on parent size
	var convertPercentageToPixels = function(percentValue, parentSize) {
		return (percentValue / 100) * parentSize;
	};
	
	// Helper to get parent size for percentage calculations
	var getParentSize = function(element) {
		if(!element || !element.parentElement) return 0;
		var parentElement = element.parentElement;
		if(self.position === "relative") {
			return self.direction === "horizontal" ? parentElement.offsetWidth : parentElement.offsetHeight;
		} else {
			var parentRect = parentElement.getBoundingClientRect();
			return self.direction === "horizontal" ? parentRect.width : parentRect.height;
		}
	};
	
	// Convert any CSS unit to pixels
	var convertToPixels = function(value, unit, element) {
		var numericValue = parseFloat(value);
		if(isNaN(numericValue)) return 0;
		
		switch(unit) {
			case "px":
				return numericValue;
			case "%":
				return convertPercentageToPixels(numericValue, getParentSize(element || domNode));
			case "em":
				// em is relative to font-size of the element
				var fontSize = 16; // default fallback
				try {
					fontSize = parseFloat(self.document.defaultView.getComputedStyle(element || domNode).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return numericValue * fontSize;
			case "rem":
				// rem is relative to font-size of the root element
				var rootFontSize = 16; // default fallback
				try {
					rootFontSize = parseFloat(self.document.defaultView.getComputedStyle(self.document.documentElement).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return numericValue * rootFontSize;
			case "vh":
				// vh is 1% of viewport height
				var viewportHeight = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				return numericValue * (viewportHeight / 100);
			case "vw":
				// vw is 1% of viewport width
				var viewportWidth = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				return numericValue * (viewportWidth / 100);
			case "vmin":
				// vmin is 1% of viewport's smaller dimension
				var vw = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmin = Math.min(vw, vh);
				return numericValue * (vmin / 100);
			case "vmax":
				// vmax is 1% of viewport's larger dimension
				var vw2 = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh2 = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmax = Math.max(vw2, vh2);
				return numericValue * (vmax / 100);
			default:
				// Unknown unit, treat as pixels
				return numericValue;
		}
	};
	
	// Convert pixels back to the original unit
	var convertFromPixels = function(pixelValue, unit, element) {
		switch(unit) {
			case "px":
				return pixelValue;
			case "%":
				var parentSize = getParentSize(element || domNode);
				return parentSize > 0 ? (pixelValue / parentSize) * 100 : 0;
			case "em":
				var fontSize = 16; // default fallback
				try {
					fontSize = parseFloat(self.document.defaultView.getComputedStyle(element || domNode).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return fontSize > 0 ? pixelValue / fontSize : 0;
			case "rem":
				var rootFontSize = 16; // default fallback
				try {
					rootFontSize = parseFloat(self.document.defaultView.getComputedStyle(self.document.documentElement).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return rootFontSize > 0 ? pixelValue / rootFontSize : 0;
			case "vh":
				var viewportHeight = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				return (pixelValue / viewportHeight) * 100;
			case "vw":
				var viewportWidth = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				return (pixelValue / viewportWidth) * 100;
			case "vmin":
				var vw = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmin = Math.min(vw, vh);
				return (pixelValue / vmin) * 100;
			case "vmax":
				var vw2 = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh2 = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmax = Math.max(vw2, vh2);
				return (pixelValue / vmax) * 100;
			default:
				return pixelValue;
		}
	};
	
	// Robust calc() expression evaluator with support for nested expressions, parentheses, and all operations
	var evaluateCalcExpression = function(expression, contextSize) {
		// Tokenize the expression
		var tokens = [];
		var current = "";
		var i = 0;
		
		while(i < expression.length) {
			var char = expression[i];
			
			// Handle whitespace
			if(/\s/.test(char)) {
				if(current) {
					tokens.push(current);
					current = "";
				}
				i++;
				continue;
			}
			
			// Handle operators and parentheses
			if("+-*/()".indexOf(char) !== -1) {
				if(current) {
					tokens.push(current);
					current = "";
				}
				tokens.push(char);
				i++;
				continue;
			}
			
			// Handle nested calc()
			if(expression.substr(i, 5) === "calc(") {
				if(current) {
					tokens.push(current);
					current = "";
				}
				// Find matching closing parenthesis
				var depth = 1;
				var j = i + 5;
				while(j < expression.length && depth > 0) {
					if(expression[j] === "(") depth++;
					else if(expression[j] === ")") depth--;
					j++;
				}
				// Recursively evaluate nested calc
				var nestedExpr = expression.substring(i + 5, j - 1);
				var nestedResult = evaluateCalcExpression(nestedExpr, contextSize);
				tokens.push(String(nestedResult));
				i = j;
				continue;
			}
			
			// Build current token
			current += char;
			i++;
		}
		
		if(current) {
			tokens.push(current);
		}
		
		// Convert tokens to values
		var values = [];
		var operators = [];
		
		for(var t = 0; t < tokens.length; t++) {
			var token = tokens[t];
			
			if("+-*/".indexOf(token) !== -1) {
				// Process higher precedence operators first
				while(operators.length > 0 && operators[operators.length - 1] !== "(" &&
					  getPrecedence(operators[operators.length - 1]) >= getPrecedence(token)) {
					processOperator(values, operators);
				}
				operators.push(token);
			} else if(token === "(") {
				operators.push(token);
			} else if(token === ")") {
				// Process until matching opening parenthesis
				while(operators.length > 0 && operators[operators.length - 1] !== "(") {
					processOperator(values, operators);
				}
				operators.pop(); // Remove the "("
			} else {
				// It's a value - convert to pixels
				values.push(convertToPixels(token, contextSize));
			}
		}
		
		// Process remaining operators
		while(operators.length > 0) {
			processOperator(values, operators);
		}
		
		return values[0] || 0;
		
		// Helper functions
		function getPrecedence(op) {
			if(op === "+" || op === "-") return 1;
			if(op === "*" || op === "/") return 2;
			return 0;
		}
		
		function processOperator(values, operators) {
			var op = operators.pop();
			var b = values.pop();
			var a = values.pop();
			
			if(a === undefined || b === undefined) {
				values.push(0);
				return;
			}
			
			switch(op) {
				case "+": values.push(a + b); break;
				case "-": values.push(a - b); break;
				case "*": values.push(a * b); break;
				case "/": values.push(b !== 0 ? a / b : 0); break;
			}
		}
		
		function convertToPixels(value, contextSize) {
			// If already a number, return it
			var num = parseFloat(value);
			if(!isNaN(num) && value === String(num)) {
				return num;
			}
			
			// Get viewport dimensions
			var viewportWidth = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
			var viewportHeight = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
			var vmin = Math.min(viewportWidth, viewportHeight);
			var vmax = Math.max(viewportWidth, viewportHeight);
			
			// Handle different units
			if(value.endsWith("px")) {
				return parseFloat(value);
			} else if(value.endsWith("vw")) {
				return (parseFloat(value) / 100) * viewportWidth;
			} else if(value.endsWith("vh")) {
				return (parseFloat(value) / 100) * viewportHeight;
			} else if(value.endsWith("vmin")) {
				return (parseFloat(value) / 100) * vmin;
			} else if(value.endsWith("vmax")) {
				return (parseFloat(value) / 100) * vmax;
			} else if(value.endsWith("%")) {
				return (parseFloat(value) / 100) * contextSize;
			} else if(value.endsWith("em") || value.endsWith("rem")) {
				// For em/rem, we need to get the computed font size
				// Default to 16px if we can't determine it
				var fontSize = 16;
				try {
					if(value.endsWith("rem")) {
						fontSize = parseFloat(getComputedStyle(self.document.documentElement).fontSize) || 16;
					} else if(self.domNodes && self.domNodes[0]) {
						fontSize = parseFloat(getComputedStyle(self.domNodes[0]).fontSize) || 16;
					}
				} catch(e) {
					// Fallback to default
				}
				return parseFloat(value) * fontSize;
			} else {
				// Try to parse as number (treat as pixels)
				return parseFloat(value) || 0;
			}
		}
	};
	
	// Helper to evaluate calc() expressions and other CSS values
	var evaluateCSSValue = function(value, contextSize) {
		if(typeof value !== "string") return value;
		
		// Clean up the value by trimming and removing trailing semicolons
		value = value.trim();
		if(value.endsWith(";")) {
			value = value.substring(0, value.length - 1).trim();
		}
		
		// If it's already a number, return it
		var numericValue = parseFloat(value);
		if(!isNaN(numericValue) && value === String(numericValue)) {
			return numericValue;
		}
		
		// Handle simple units
		if(value.endsWith("%")) {
			return (parseFloat(value) / 100) * contextSize;
		}
		if(value.endsWith("px")) {
			return parseFloat(value);
		}
		
		// Handle calc() expressions
		if(value.startsWith("calc(") && value.endsWith(")")) {
			var expression = value.substring(5, value.length - 1).trim();
			return evaluateCalcExpression(expression, contextSize);
		}
		
		// If we can't evaluate it, try to parse as a number
		return parseFloat(value) || 0;
	};
	
	// Helper to update the tiddler values based on drag delta (in pixels)
	var updateValues = function(pixelDelta) {
		// Use the cached min/max values from drag start
		// They're already in pixels from evaluateCSSValue
		
		// Pre-calculate clamped delta based on min/max constraints
		var clampedDelta = pixelDelta;
		
		// Check constraints for all tiddlers and clamp delta accordingly
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				if(startValues[tiddlerTitle] !== undefined) {
					var newPixelValue = startValues[tiddlerTitle] + pixelDelta;
					if(effectiveMinValue !== null && newPixelValue < effectiveMinValue) {
						// Calculate the maximum negative delta that won't go below min
						var maxNegativeDelta = effectiveMinValue - startValues[tiddlerTitle];
						clampedDelta = Math.max(clampedDelta, maxNegativeDelta);
					}
					if(effectiveMaxValue !== null && newPixelValue > effectiveMaxValue) {
						// Calculate the maximum positive delta that won't exceed max
						var maxPositiveDelta = effectiveMaxValue - startValues[tiddlerTitle];
						clampedDelta = Math.min(clampedDelta, maxPositiveDelta);
					}
				}
			});
		} else if(self.targetTiddler) {
			var newPixelValue = startValue + pixelDelta;
			if(effectiveMinValue !== null && newPixelValue < effectiveMinValue) {
				clampedDelta = effectiveMinValue - startValue;
			}
			if(effectiveMaxValue !== null && newPixelValue > effectiveMaxValue) {
				clampedDelta = effectiveMaxValue - startValue;
			}
		}
		
		// Update all target tiddlers with clamped delta
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				if(startValues[tiddlerTitle] !== undefined && startUnits[tiddlerTitle]) {
					var newPixelValue = startValues[tiddlerTitle] + clampedDelta;
					var originalUnit = startUnits[tiddlerTitle];
					
					// Convert back to the original unit
					var convertedValue = convertFromPixels(newPixelValue, originalUnit, domNode);
					
					// Format the value based on the original unit type
					var formattedValue;
					if(originalUnit === "%") {
						// For percentages, round to 1 decimal place
						formattedValue = convertedValue.toFixed(1) + "%";
					} else if(originalUnit === "em" || originalUnit === "rem") {
						// For em/rem, round to 2 decimal places
						formattedValue = convertedValue.toFixed(2) + originalUnit;
					} else if(originalUnit === "px") {
						// For pixels, round to integer
						formattedValue = Math.round(convertedValue) + "px";
					} else {
						// For other units (vh, vw, etc.), round to 1 decimal place
						formattedValue = convertedValue.toFixed(1) + originalUnit;
					}
					
					self.wiki.setText(tiddlerTitle, self.targetField || "text", null, formattedValue);
				}
			});
		} else if(self.targetTiddler) {
			// Fallback to single tiddler for backwards compatibility
			var newPixelValue = startValue + clampedDelta;
			
			// Use widget's unit for single tiddler mode
			var convertedValue = convertFromPixels(newPixelValue, self.unit, domNode);
			
			// Format the value based on the unit type
			var formattedValue;
			if(self.unit === "%") {
				// For percentages, round to 1 decimal place
				formattedValue = convertedValue.toFixed(1) + "%";
			} else if(self.unit === "em" || self.unit === "rem") {
				// For em/rem, round to 2 decimal places
				formattedValue = convertedValue.toFixed(2) + self.unit;
			} else {
				// For pixels and other units, round to integer
				formattedValue = Math.round(convertedValue) + (self.unit || "px");
			}
			
			self.wiki.setText(self.targetTiddler, self.targetField || "text", null, formattedValue);
		}
		
		// Call action string if provided
		if(self.actions) {
			// Use the first tiddler's value for the action
			var actionPixelValue = startValue + clampedDelta;
			if(self.targetTiddlers && self.targetTiddlers.length > 0 && startValues[self.targetTiddlers[0]] !== undefined) {
				actionPixelValue = startValues[self.targetTiddlers[0]] + clampedDelta;
			}
			
			// Convert to widget's unit for the action
			var actionValue = convertFromPixels(actionPixelValue, self.unit, domNode);
			var formattedValue;
			if(self.unit === "%") {
				formattedValue = actionValue.toFixed(1) + "%";
			} else if(self.unit === "em" || self.unit === "rem") {
				formattedValue = actionValue.toFixed(2) + self.unit;
			} else {
				formattedValue = Math.round(actionValue) + (self.unit || "px");
			}
			// Set variables for the action string
			self.setVariable("actionValue", actionValue.toString());
			self.setVariable("actionFormattedValue", formattedValue);
			self.invokeActionString(self.actions, self);
		}
	};
	
	var handlePointerDown = function(event) {
		event.preventDefault();
		isResizing = true;
		
		// Store the actual initial mouse position
		initialMouseX = event.clientX;
		initialMouseY = event.clientY;
		
		// For now, use simple start position without offset adjustment
		startX = event.clientX;
		startY = event.clientY;
		
		// Cache the parent size at the start of drag for percentage calculations
		// We need this early for unit conversions
		var parentElement = domNode.parentElement;
		if(parentElement) {
			parentSizeAtStart = getParentSize(domNode);
		}
		
		// Cache the evaluated min/max values at drag start
		effectiveMinValue = self.minValueRaw ? evaluateCSSValue(self.minValueRaw, parentSizeAtStart) : null;
		effectiveMaxValue = self.maxValueRaw ? evaluateCSSValue(self.maxValueRaw, parentSizeAtStart) : null;
		
		// Find the target element(s) to resize FIRST so we can measure them
		var targetElements = [];
		if(self.targetSelector) {
			if(self.resizeMode === "multiple") {
				targetElements = Array.from(self.document.querySelectorAll(self.targetSelector));
			} else {
				var singleElement = self.document.querySelector(self.targetSelector);
				if(singleElement) targetElements = [singleElement];
			}
		} else if(self.targetElement === "parent") {
			targetElements = [domNode.parentElement];
		} else if(self.targetElement === "previousSibling") {
			if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
		} else if(self.targetElement === "nextSibling") {
			if(domNode.nextElementSibling) targetElements = [domNode.nextElementSibling];
		} else {
			// Default behavior depends on handle position
			if(self.handlePosition === "overlay") {
				// For overlay mode, target the parent element
				targetElements = [domNode.parentElement];
			} else {
				// For non-overlay mode: for vertical resizers, target previous sibling; for horizontal, target previous sibling
				if(self.direction === "vertical") {
					if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
				} else {
					if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
				}
			}
		}
		targetElement = targetElements[0]; // Keep for backward compatibility
		
		// Get and store the current value for each tiddler
		startValues = {}; // Reset the object
		startUnits = {}; // Reset the units object
		
		// Helper to get the actual computed size of an element
		var getElementSize = function(element) {
			if(!element) return null;
			var rect = element.getBoundingClientRect();
			return self.direction === "horizontal" ? rect.width : rect.height;
		};
		
		// If we have a target element, measure its actual size
		var measuredSize = null;
		if(targetElement) {
			measuredSize = getElementSize(targetElement);
		}
		
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle, index) {
				// If we have a measured size from the actual element, use that for the first tiddler
				// This ensures we're starting from the actual rendered size, not the stored value
				if(index === 0 && measuredSize !== null) {
					startValues[tiddlerTitle] = measuredSize;
					// Detect the unit from the tiddler value for later conversion
					var tiddler = self.wiki.getTiddler(tiddlerTitle);
					var storedValue;
					if(tiddler && self.targetField && self.targetField !== "text") {
						storedValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
					} else {
						storedValue = self.wiki.getTiddlerText(tiddlerTitle, self.defaultValue || "200px");
					}
					startUnits[tiddlerTitle] = getUnit(storedValue);
				} else {
					// For other tiddlers or if no element to measure, fall back to stored value
					var tiddler = self.wiki.getTiddler(tiddlerTitle);
					var currentValue;
					if(tiddler && self.targetField && self.targetField !== "text") {
						currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
					} else {
						currentValue = self.wiki.getTiddlerText(tiddlerTitle, self.defaultValue || "200px");
					}
					
					// Get the numeric value and unit
					var numericValue = getNumericValue(currentValue);
					var valueUnit = getUnit(currentValue);
					
					// Store the original unit for this tiddler
					startUnits[tiddlerTitle] = valueUnit;
					
					// Convert to pixels for internal calculations
					var pixelValue = convertToPixels(numericValue, valueUnit, domNode);
					startValues[tiddlerTitle] = pixelValue;
				}
			});
			// For backwards compatibility, set startValue to the first tiddler's value
			startValue = startValues[self.targetTiddlers[0]] || 0;
		} else if(self.targetTiddler) {
			// Fallback to single tiddler for backwards compatibility
			if(measuredSize !== null) {
				// Use the measured size from the actual element
				startValue = measuredSize;
				// Get the unit from the stored value
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var storedValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					storedValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					storedValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				self.unit = getUnit(storedValue);
			} else {
				// No element to measure, fall back to stored value
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				
				// Get the numeric value and unit
				var numericValue = getNumericValue(currentValue);
				var valueUnit = getUnit(currentValue);
				
				// Convert to pixels for internal calculations
				startValue = convertToPixels(numericValue, valueUnit, domNode);
			}
		} else {
			// No tiddler specified, try to measure element or use default
			if(measuredSize !== null) {
				startValue = measuredSize;
			} else {
				startValue = getNumericValue(self.defaultValue || "200px");
			}
		}
		
		// Add active class
		domNode.classList.add("tc-resizer-active");
		
		// Add resizing class to body to disable transitions
		self.document.body.classList.add("tc-resizing");
		
		// Call resize start callback
		if(self.onResizeStart) {
			// Set variables for the action string
			self.setVariable("actionValue", startValue.toString());
			self.setVariable("actionFormattedValue", startValue + (self.unit || "px"));
			self.setVariable("actionDirection", self.direction);
			self.setVariable("actionProperty", self.targetProperty);
			self.invokeActionString(self.onResizeStart, self);
		}
		
		// Get or create the singleton overlay
		var overlay = ResizerWidget.getOverlay(self.document);
		
		// Set the cursor for this resize operation
		overlay.style.cursor = self.direction === "horizontal" ? "ew-resize" : "ns-resize";
		
		// Add pointermove handler to overlay
		overlay.addEventListener("pointermove", handlePointerMove);
		overlay.addEventListener("pointerup", handlePointerUp);
		// Cancel drag if pointer leaves the window
		overlay.addEventListener("pointerleave", handlePointerUp);
		overlay.addEventListener("pointercancel", handlePointerUp);
		
		self.overlay = overlay;
		
		// Store pointer ID for capture
		self.pointerId = event.pointerId;
		
		// Capture pointer events to the overlay
		try {
			overlay.setPointerCapture(event.pointerId);
		} catch(e) {
			// Pointer capture might not be supported or might fail
			console.error("Failed to capture pointer:", e);
		}
		
		// Prevent text selection
		self.document.body.style.userSelect = "none";
		
		// Store cleanup function on the widget
		self.cleanupResize = cleanupResize;
	};
	
	var handlePointerMove = function(event) {
		if(!isResizing) return;
		
		// Check if pointer is outside the viewport
		if(event.clientX < 0 || event.clientY < 0 ||
		   event.clientX > self.document.documentElement.clientWidth ||
		   event.clientY > self.document.documentElement.clientHeight) {
			// Pointer is outside viewport, stop the resize
			cleanupResize();
			return;
		}
		
		// Store the event for processing
		pendingMouseEvent = event;
		
		// Use requestAnimationFrame for smooth updates
		if(!animationFrameId) {
			animationFrameId = requestAnimationFrame(function() {
				animationFrameId = null;
				
				if(!pendingMouseEvent || !isResizing) return;
				
				var deltaX = pendingMouseEvent.clientX - startX;
				var deltaY = pendingMouseEvent.clientY - startY;
				
				// Calculate pixel delta based on direction and invert setting
				var pixelDelta;
				if(self.direction === "horizontal") {
					pixelDelta = self.invertDirection === "yes" ? -deltaX : deltaX;
				} else {
					pixelDelta = self.invertDirection === "yes" ? -deltaY : deltaY;
				}
				
				// Update all values based on the pixel delta
				updateValues(pixelDelta);
				
				// Call resize callback
				if(self.onResize) {
					// Use the first tiddler's value for the callback
					var callbackPixelValue = startValue + pixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && startValues[self.targetTiddlers[0]] !== undefined) {
						callbackPixelValue = startValues[self.targetTiddlers[0]] + pixelDelta;
					}
					
					// Convert to widget's unit for the callback
					var callbackValue = convertFromPixels(callbackPixelValue, self.unit, domNode);
					var formattedValue;
					if(self.unit === "%") {
						formattedValue = callbackValue.toFixed(1) + "%";
					} else if(self.unit === "em" || self.unit === "rem") {
						formattedValue = callbackValue.toFixed(2) + self.unit;
					} else {
						formattedValue = Math.round(callbackValue) + (self.unit || "px");
					}
					
					// Set variables for the action string
					self.setVariable("actionValue", callbackValue.toString());
					self.setVariable("actionFormattedValue", formattedValue);
					self.setVariable("actionDirection", self.direction);
					self.setVariable("actionProperty", self.targetProperty);
					self.setVariable("actionDeltaX", deltaX.toString());
					self.setVariable("actionDeltaY", deltaY.toString());
					self.invokeActionString(self.onResize, self);
				}
				
				// Optionally update the target element(s) directly for immediate feedback
				if(self.liveResize === "yes" && targetElements.length > 0) {
					// For live resize of DOM elements, we'll use the first tiddler's value as reference
					var livePixelValue = startValue + pixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && startValues[self.targetTiddlers[0]] !== undefined) {
						livePixelValue = startValues[self.targetTiddlers[0]] + pixelDelta;
					}
					
					// Convert to widget's unit for live resize
					var liveValue = convertFromPixels(livePixelValue, self.unit, domNode);
					
					$tw.utils.each(targetElements, function(element) {
						if(element) {
							element.style[self.targetProperty] = liveValue + (self.unit || "px");
							
							// Apply aspect ratio constraints
							if(aspectRatioValue && (self.targetProperty === "width" || self.targetProperty === "height")) {
								var secondaryProperty, secondaryValue;
								if(self.targetProperty === "width") {
									secondaryProperty = "height";
									secondaryValue = liveValue / aspectRatioValue;
								} else {
									secondaryProperty = "width";
									secondaryValue = liveValue * aspectRatioValue;
								}
								element.style[secondaryProperty] = secondaryValue + (self.unit || "px");
							}
						}
					});
				}
			});
		}
	};
	
	// Cleanup function to stop resize operation
	var cleanupResize = function() {
		if(!isResizing) return;
		
		isResizing = false;
		domNode.classList.remove("tc-resizer-active");
		
		// Cancel any pending animation frame
		if(animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		
		// Remove resizing class from body
		self.document.body.classList.remove("tc-resizing");
		
		// Clean up overlay
		if(self.overlay) {
			// Release pointer capture if we have it
			if(self.pointerId !== undefined) {
				try {
					self.overlay.releasePointerCapture(self.pointerId);
				} catch(e) {
					// Pointer might already be released
				}
			}
			// Remove event listeners
			self.overlay.removeEventListener("pointermove", handlePointerMove);
			self.overlay.removeEventListener("pointerup", handlePointerUp);
			self.overlay.removeEventListener("pointerleave", handlePointerUp);
			self.overlay.removeEventListener("pointercancel", handlePointerUp);
			// Reset cursor
			self.overlay.style.cursor = "";
			self.overlay = null;
		}
		
		// Restore cursor and selection
		self.document.body.style.userSelect = "";
		
		// Clear the cleanup reference
		self.cleanupResize = null;
	};
	
	var handlePointerUp = function(event) {
		if(!isResizing) return;
		
		cleanupResize();
		
		// Call resize end callback
		if(self.onResizeEnd) {
			// Get final value from tiddler or current state
			var finalValue = startValue;
			if(self.targetTiddlers && self.targetTiddlers.length > 0) {
				var firstTiddler = self.targetTiddlers[0];
				var tiddler = self.wiki.getTiddler(firstTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(firstTiddler, self.defaultValue || "200px");
				}
				finalValue = getNumericValue(currentValue);
			} else if(self.targetTiddler) {
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				finalValue = getNumericValue(currentValue);
			}
			
			var formattedValue = self.unit === "%" ? finalValue.toFixed(1) + "%" : Math.round(finalValue) + (self.unit || "px");
			// Set variables for the action string
			self.setVariable("actionValue", finalValue.toString());
			self.setVariable("actionFormattedValue", formattedValue);
			self.setVariable("actionDirection", self.direction);
			self.setVariable("actionProperty", self.targetProperty);
			self.invokeActionString(self.onResizeEnd, self);
		}
	};
	
	// Store the event handler reference for cleanup
	self.handlePointerDownReference = handlePointerDown;
	
	// Add pointer event listener (works for both mouse and touch)
	domNode.addEventListener("pointerdown", handlePointerDown);
};

/*
Compute the internal state of the widget
*/
ResizerWidget.prototype.execute = function() {
	// Get our parameters
	this.direction = this.getAttribute("direction", "horizontal"); // horizontal or vertical
	this.targetTiddler = this.getAttribute("tiddler");
	this.targetFilter = this.getAttribute("filter");
	// Parse tiddler attribute as a filter expression
	this.targetTiddlers = this.targetFilter ? this.wiki.filterTiddlers(this.targetFilter) : [];
	this.targetField = this.getAttribute("field", "text");
	this.targetSelector = this.getAttribute("selector");
	this.targetElement = this.getAttribute("element"); // parent, previousSibling, nextSibling
	this.targetProperty = this.getAttribute("property", this.direction === "horizontal" ? "width" : "height"); // CSS property to modify
	this.unit = this.getAttribute("unit", "px");
	this.position = this.getAttribute("position", "absolute"); // absolute or relative
	this.defaultValue = this.getAttribute("default", this.unit === "%" ? "50%" : "200px");
	// Store raw min/max values for calc() support
	this.minValueRaw = this.getAttribute("min");
	this.maxValueRaw = this.getAttribute("max");
	// Parse min/max values - defaults depend on unit type
	var minDefault = this.unit === "%" ? "10" : "50";
	var maxDefault = this.unit === "%" ? "90" : "800";
	this.minValue = this.minValueRaw ? parseFloat(this.minValueRaw) : parseFloat(minDefault);
	this.maxValue = this.maxValueRaw ? parseFloat(this.maxValueRaw) : parseFloat(maxDefault);
	this.invertDirection = this.getAttribute("invert", "no");
	this.liveResize = this.getAttribute("live", "no");
	this.resizerClass = this.getAttribute("class", "");
	this.actions = this.getAttribute("actions");
	this.aspectRatio = this.getAttribute("aspectRatio"); // e.g., "16:9" or "1.5"
	this.resizeMode = this.getAttribute("mode", "single"); // single or multiple
	this.handlePosition = this.getAttribute("handlePosition", "after"); // before, after, overlay
	this.onResizeStart = this.getAttribute("onResizeStart");
	this.onResize = this.getAttribute("onResize");
	this.onResizeEnd = this.getAttribute("onResizeEnd");
	this.disable = this.getAttribute("disable", "no");
	// Make child widgets
	this.makeChildWidgets();
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
ResizerWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(Object.keys(changedAttributes).length) {
		this.refreshSelf();
		return true;
	}
	return this.refreshChildren(changedTiddlers);
};

/*
Remove any DOM elements created by this widget
*/
ResizerWidget.prototype.removeChildDomNodes = function() {
	// Clean up any active resize operation
	if(this.cleanupResize) {
		this.cleanupResize();
	}
	// Call parent implementation
	Widget.prototype.removeChildDomNodes.call(this);
};

/*
Destroy the widget and clean up resources
*/
ResizerWidget.prototype.destroy = function() {
	var self = this;
	// Remove event listeners
	if(self.domNodes && self.domNodes[0] && self.handlePointerDownReference) {
		self.domNodes[0].removeEventListener("pointerdown", self.handlePointerDownReference);
	}
	// Clean up any active resize
	if(self.cleanupResize) {
		self.cleanupResize();
	}
	// Call parent destroy if it exists
	if(Widget.prototype.destroy) {
		Widget.prototype.destroy.call(this);
	}
};

exports.resizer = ResizerWidget;
