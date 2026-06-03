/*\
title: $:/plugins/BTC/resizer/modules/utils/units.js
type: application/javascript
module-type: library

Extracted compatibility module for the BTC resizer widget.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.install = function(ResizerWidget) {

ResizerWidget.prototype.getViewportDimensions = function() {
	var win = this.document.defaultView || this.document.parentWindow || {};
	// Use visualViewport API for more precise measurements when available
	var viewport = win.visualViewport || null;
	var width, height;
	
	if(viewport) {
		// visualViewport provides sub-pixel precision and accounts for zoom/pinch
		width = viewport.width;
		height = viewport.height;
	} else {
		// Fallback to standard viewport measurements
		// innerWidth/Height are more accurate than clientWidth/Height as they include scrollbars
		width = win.innerWidth || this.document.documentElement.clientWidth;
		height = win.innerHeight || this.document.documentElement.clientHeight;
	}
	
	return {
		width: width,
		height: height,
		get vmin() { return Math.min(this.width, this.height); },
		get vmax() { return Math.max(this.width, this.height); }
	};
};

// Get computed font size for an element with sub-pixel precision
ResizerWidget.prototype.getComputedFontSize = function(element, isRoot) {
	try {
		var targetElement = isRoot ? this.document.documentElement : (element || this.domNodes[0]);
		if(targetElement) {
			var computedStyle = this.document.defaultView.getComputedStyle(targetElement);
			// Parse font-size with higher precision (don't round)
			var fontSize = computedStyle.fontSize;
			// Handle different units that might be returned
			if(fontSize.endsWith('px')) {
				return parseFloat(fontSize);
			} else if(fontSize.endsWith('pt')) {
				// Convert points to pixels (1pt = 1.333...px)
				return parseFloat(fontSize) * (96 / 72);
			} else {
				// For other units, try to parse as-is
				return parseFloat(fontSize) || 16;
			}
		}
	} catch(e) {
		// Use default if getComputedStyle fails
	}
	return 16;
};

// Convert any CSS unit to pixels with high precision
ResizerWidget.prototype.convertToPixels = function(value, unit, contextSize, element) {
	var numericValue = parseFloat(value);
	if(isNaN(numericValue)) return 0;
	
	// Cache viewport dimensions for this conversion to avoid multiple calls
	var viewport = null;
	if(unit === "vh" || unit === "vw" || unit === "vmin" || unit === "vmax") {
		viewport = this.getViewportDimensions();
	}
	
	switch(unit) {
		case "px":
			return numericValue;
		case "%":
			// Use precise multiplication without intermediate rounding
			return (numericValue * contextSize) / 100;
		case "em":
			// Get precise font size and multiply
			return numericValue * this.getComputedFontSize(element, false);
		case "rem":
			// Get precise root font size and multiply
			return numericValue * this.getComputedFontSize(element, true);
		case "vh":
			// Use cached viewport and precise division
			return (numericValue * viewport.height) / 100;
		case "vw":
			// Use cached viewport and precise division
			return (numericValue * viewport.width) / 100;
		case "vmin":
			// Use cached viewport and precise division
			return (numericValue * viewport.vmin) / 100;
		case "vmax":
			// Use cached viewport and precise division
			return (numericValue * viewport.vmax) / 100;
		default:
			return numericValue;
	}
};

// Convert pixels back to the original unit with high precision
ResizerWidget.prototype.convertFromPixels = function(pixelValue, unit, contextSize, element) {
	// Cache viewport dimensions for this conversion to avoid multiple calls
	var viewport = null;
	if(unit === "vh" || unit === "vw" || unit === "vmin" || unit === "vmax") {
		viewport = this.getViewportDimensions();
	}
	
	switch(unit) {
		case "px":
			return pixelValue;
		case "%":
			// Precise percentage calculation
			return contextSize > 0 ? Math.max((pixelValue * 100) / contextSize, 0) : 0;
		case "em":
			// Precise em calculation with sub-pixel font size
			var fontSize = this.getComputedFontSize(element, false);
			return fontSize > 0 ? pixelValue / fontSize : 0;
		case "rem":
			// Precise rem calculation with sub-pixel root font size
			var rootFontSize = this.getComputedFontSize(element, true);
			return rootFontSize > 0 ? pixelValue / rootFontSize : 0;
		case "vh":
			// Precise viewport height percentage
			return viewport.height > 0 ? (pixelValue * 100) / viewport.height : 0;
		case "vw":
			// Precise viewport width percentage
			return viewport.width > 0 ? (pixelValue * 100) / viewport.width : 0;
		case "vmin":
			// Precise viewport minimum percentage
			return viewport.vmin > 0 ? (pixelValue * 100) / viewport.vmin : 0;
		case "vmax":
			// Precise viewport maximum percentage
			return viewport.vmax > 0 ? (pixelValue * 100) / viewport.vmax : 0;
		default:
			return pixelValue;
	}
};

// Detect the unit of a value
ResizerWidget.prototype.getUnit = function(value) {
	if(typeof value !== "string") return "px";
	// Handle calc() expressions - default to px
	if(value.startsWith("calc(") && value.endsWith(")")) return "px";
	var units = ["px", "%", "em", "rem", "vh", "vw", "vmin", "vmax"];
	for(var i = 0; i < units.length; i++) {
		if(value.endsWith(units[i])) return units[i];
	}
	// If no unit specified, assume pixels
	return "px";
};

// Robust calc() expression evaluator with support for nested expressions, parentheses, and all operations
ResizerWidget.prototype.evaluateCalcExpression = function(expression, contextSize, handleSize, depth) {
	var self = this;
	// Limit recursion depth to prevent stack overflow
	depth = depth || 0;
	if(depth > 10) {
		console.warn("calc() expression too deeply nested, limiting depth");
		return 0;
	}
	
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
			var nestedDepth = 1;
			var j = i + 5;
			while(j < expression.length && nestedDepth > 0) {
				if(expression[j] === "(") nestedDepth++;
				else if(expression[j] === ")") nestedDepth--;
				j++;
			}
			// Recursively evaluate nested calc with depth tracking
			var nestedExpr = expression.substring(i + 5, j - 1);
			var nestedResult = self.evaluateCalcExpression(nestedExpr, contextSize, handleSize, depth + 1);
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
			values.push(convertToPixelsCalc(token, contextSize));
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
	
	function convertToPixelsCalc(value, contextSize) {
		// Handle special variables
		if(value === "handleSize" || value === "handleWidth" || value === "handleHeight") {
			return handleSize || 0;
		}
		
		// If already a number, return it
		var num = parseFloat(value);
		if(!isNaN(num) && value === String(num)) {
			return num;
		}
		
		// Cache viewport dimensions for efficiency
		var viewport = self.getViewportDimensions();
		
		// Extract numeric value with high precision
		var numericValue = parseFloat(value);
		if(isNaN(numericValue)) return 0;
		
		// Handle different units with improved precision
		if(value.endsWith("px")) {
			return numericValue;
		} else if(value.endsWith("vw")) {
			// Use precise multiplication
			return (numericValue * viewport.width) / 100;
		} else if(value.endsWith("vh")) {
			// Use precise multiplication
			return (numericValue * viewport.height) / 100;
		} else if(value.endsWith("vmin")) {
			// Use precise multiplication
			return (numericValue * viewport.vmin) / 100;
		} else if(value.endsWith("vmax")) {
			// Use precise multiplication
			return (numericValue * viewport.vmax) / 100;
		} else if(value.endsWith("%")) {
			// Use precise multiplication
			return (numericValue * contextSize) / 100;
		} else if(value.endsWith("rem")) {
			// Use precise rem calculation
			var rootFontSize = self.getComputedFontSize(self.domNodes[0], true);
			return numericValue * rootFontSize;
		} else if(value.endsWith("em")) {
			// Use precise em calculation
			var fontSize = self.getComputedFontSize(self.domNodes[0], false);
			return numericValue * fontSize;
		} else {
			// Try to parse as number (treat as pixels)
			return numericValue || 0;
		}
	}
};

// Format a numeric value with the appropriate unit and stable precision
ResizerWidget.prototype.formatValueWithUnit = function(value, unit) {
	unit = unit || this.unit || "px";

	var formatNumber = function(number, decimals) {
		if(!isFinite(number)) {
			number = 0;
		}
		return number
			.toFixed(decimals)
			.replace(/\.?0+$/, "");
	};

	switch(unit) {
		case "%":
			// Use enough precision for stable layouts, without floating-point noise
			return formatNumber(value, 6) + "%";
		case "em":
		case "rem":
			return formatNumber(value, 4) + unit;
		case "vh":
		case "vw":
		case "vmin":
		case "vmax":
			return formatNumber(value, 4) + unit;
		case "px":
		default:
			return formatNumber(value, 2) + "px";
	}
};

// Get target elements based on widget configuration
ResizerWidget.prototype.getTargetElements = function(domNode) {
	var targetElements = [];
	if(this.targetSelector) {
		if(this.resizeMode === "multiple") {
			targetElements = Array.from(this.document.querySelectorAll(this.targetSelector));
		} else {
			var singleElement = this.document.querySelector(this.targetSelector);
			if(singleElement) targetElements = [singleElement];
		}
	} else if(this.targetElement === "parent") {
		targetElements = [domNode.parentElement];
	} else if(this.targetElement === "parent.parent") {
		if(domNode.parentElement && domNode.parentElement.parentElement) {
			targetElements = [domNode.parentElement.parentElement];
		}
	} else if(this.targetElement === "previousSibling") {
		if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
	} else if(this.targetElement === "nextSibling") {
		if(domNode.nextElementSibling) targetElements = [domNode.nextElementSibling];
	} else {
		// Default behavior depends on handle position
		if(this.handlePosition === "overlay") {
			// For overlay mode, target the parent element
			targetElements = [domNode.parentElement];
		} else {
			// For non-overlay mode: default to previous sibling
			if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
		}
	}
	return targetElements;
};

// Read a value from a tiddler with proper field handling
ResizerWidget.prototype.getTiddlerValue = function(tiddlerTitle, defaultValue) {
	var tiddler = this.wiki.getTiddler(tiddlerTitle);
	var value;
	if(tiddler && this.targetField && this.targetField !== "text") {
		value = tiddler.fields[this.targetField] || defaultValue || this.defaultValue || "200px";
	} else {
		value = this.wiki.getTiddlerText(tiddlerTitle, defaultValue || this.defaultValue || "200px");
	}
	// If the value is empty or just whitespace, use the default value
	if(!value || value.trim() === "") {
		value = defaultValue || this.defaultValue || "200px";
	}
	return value;
};

// Apply min/max constraints to a value
ResizerWidget.prototype.applyConstraints = function(value, minValue, maxValue) {
	if(minValue !== null && minValue !== undefined && value < minValue) {
		return minValue;
	}
	if(maxValue !== null && maxValue !== undefined && value > maxValue) {
		return maxValue;
	}
	return value;
};

// Helper to evaluate calc() expressions and other CSS values
ResizerWidget.prototype.evaluateCSSValue = function(value, contextSize, handleSize, element) {
	if(typeof value !== "string") return value;

	// Clean up the value by trimming and removing trailing semicolons
	value = value.trim();
	if(value.endsWith(";")) {
		value = value.substring(0, value.length - 1).trim();
	}

	// If it's already a number, return it as pixels
	var numericValue = parseFloat(value);
	if(!isNaN(numericValue) && value === String(numericValue)) {
		return numericValue;
	}

	// Handle calc() expressions first. The calc evaluator already supports
	// px, %, em, rem, vh, vw, vmin and vmax, plus handleSize aliases.
	if(value.startsWith("calc(") && value.endsWith(")")) {
		var expression = value.substring(5, value.length - 1).trim();
		return this.evaluateCalcExpression(expression, contextSize, handleSize);
	}

	// Handle simple supported CSS units. The older implementation only handled
	// px and %, which meant values such as max="42rem" were treated as 42px.
	var unit = this.getUnit(value);
	if(unit) {
		return this.convertToPixels(value, unit, contextSize || 0, element || (this.domNodes && this.domNodes[0]));
	}

	// If we can't evaluate it, try to parse as a number
	return parseFloat(value) || 0;
};



/*
Optional feature helpers. These are additive and deliberately keep the legacy
resize flow intact. The implementation lives in small utility modules so the
widget remains backwards compatible while gaining new modes.
*/

};
