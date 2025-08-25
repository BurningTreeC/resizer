/*\
title: $:/plugins/BTC/tiddlywiki-resize/modules/filters/tocharcode.js
type: application/javascript
module-type: filteroperator

Filter operator to convert a character to its character code

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

/*
Export our filter function
*/
exports.tocharcode = function(source,operator,options) {
    var results = [];
    source(function(tiddler,title) {
        if(title.length > 0) {
            results.push(title.charCodeAt(0).toString());
        }
    });
    return results;
};
