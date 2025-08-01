# TiddlyWiki Resizer Widget Plugin

A powerful and flexible resizer widget for TiddlyWiki that enables interactive resizing of UI elements with support for multiple tiddlers, various CSS units, and calc() expressions.

## Features

- **Multi-tiddler Support**: Resize multiple tiddlers simultaneously using filter expressions
- **Comprehensive Unit Support**: Works with all CSS units (px, %, em, rem, vh, vw, vmin, vmax)
- **CSS calc() Expressions**: Use complex calculations for min/max values like `calc(100% - 350px)`
- **Unit Preservation**: Maintains each tiddler's original unit type while ensuring consistent resize behavior
- **Smart Unit Conversion**: Automatically converts between units when needed
- **Constraint System**: Enforces min/max limits across all target tiddlers as a group
- **Live Preview**: Optional real-time visual feedback during resizing
- **Directional Control**: Supports both horizontal and vertical resizing
- **Aspect Ratio**: Maintain aspect ratios during resize operations
- **Touch Support**: Works with both mouse and touch input via pointer events

## Installation

1. Download the plugin from the releases page
2. Drag and drop the plugin file into your TiddlyWiki
3. Save and reload your wiki

## Basic Usage

```html
<$resizer
  direction="horizontal"
  tiddler="$:/themes/tiddlywiki/vanilla/metrics/sidebarwidth"
  min="200px"
  max="800px"
  default="350px"
/>
```

## Widget Attributes

### Core Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `direction` | Resize direction: "horizontal" or "vertical" | "horizontal" |
| `tiddler` | Target tiddler | - |
| `filter` | Filter attribute to specify multiple tiddlers (optional alternative to `tiddler`) | - |
| `field` | Field to update in the target tiddler | "text" |
| `unit` | Unit for the resizer (px, %, em, rem, vh, vw, etc.) | "px" |
| `default` | Default value if tiddler doesn't exist | "200px" or "50%" |
| `min` | Minimum value (supports calc() expressions) | "50" or "10" |
| `max` | Maximum value (supports calc() expressions) | "800" or "90" |

### Behavior Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `invert` | Invert resize direction: "yes" or "no" | "no" |
| `live` | Update target element in real-time: "yes" or "no" | "no" |
| `position` | Position calculation: "absolute" or "relative" | "absolute" |
| `mode` | Resize mode: "single" or "multiple" | "single" |

### Target Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `selector` | CSS selector for target DOM element(s) | - |
| `element` | Target relative element: "parent", "previousSibling", "nextSibling" | - |
| `property` | CSS property to modify | "width" or "height" |
| `aspectRatio` | Maintain aspect ratio for live DOM manipulation only (e.g., "16:9" or "1.5") | - |

### Event Attributes

| Attribute | Description |
|-----------|-------------|
| `actions` | Action string to execute on value change |
| `onResizeStart` | Actions to execute when resize starts |
| `onResize` | Actions to execute during resize |
| `onResizeEnd` | Actions to execute when resize ends |

### Styling Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `class` | Additional CSS classes for the resizer | "" |
| `handlePosition` | Position of resize handle: "before", "after", "overlay" | "after" |

## Advanced Examples

### Multiple Tiddlers with Filter Expression

```html
<$resizer
  direction="horizontal"
  tiddler="[tag[layout-metrics]]"
  min="100px"
  max="calc(100% - 200px)"
/>
```

### Space-Separated Tiddler List (Filter)

```html
<$resizer
  direction="horizontal"
  filter="$:/metrics/storyright $:/metrics/storywidth $:/metrics/tiddlerwidth"
  min="300px"
  max="calc(100vw - 350px)"
/>
```

### Using Different Units

```html
<!-- Percentage-based resizing -->
<$resizer
  direction="vertical"
  tiddler="$:/config/header/height"
  unit="%"
  min="5%"
  max="50%"
  default="20%"
/>

<!-- Using viewport units -->
<$resizer
  direction="horizontal"
  tiddler="$:/config/panel/width"
  unit="vw"
  min="20vw"
  max="80vw"
  default="50vw"
/>
```

### With Actions and Events

```html
<$resizer
  direction="horizontal"
  tiddler="$:/state/sidebar/width"
  actions="""
    <$action-setfield $tiddler="$:/state/sidebar/visible" text="yes"/>
  """
  onResizeEnd="""
    <$action-log message="Resize completed" value=<<value>>/>
  """
/>
```

### Live DOM Manipulation

```html
<$resizer
  direction="horizontal"
  selector=".tc-sidebar"
  property="width"
  tiddler="$:/config/sidebar/width"
  live="yes"
/>
```

### Real-World Example

The resizer is used in TiddlyWiki's sidebar implementation:

```html
<$resizer
  class="tc-sidebar-resizer"
  direction="horizontal"
  filter="$:/themes/tiddlywiki/vanilla/metrics/storyright $:/themes/tiddlywiki/vanilla/metrics/storywidth $:/themes/tiddlywiki/vanilla/metrics/tiddlerwidth"
  min={{$:/themes/tiddlywiki/vanilla/metrics/storyminwidth}}
  max={{{ [[calc(100vw - ]addsuffix{$:/themes/tiddlywiki/vanilla/metrics/sidebarminwidth}addsuffix[)]] }}}
  default="350px"
  invert="no"
/>
```

This example demonstrates:
- Multiple tiddlers being resized together
- Dynamic min/max values from tiddlers
- Complex calc() expression for maximum value
- Integration with TiddlyWiki's theme system

## CSS calc() Expression Support

The widget supports CSS calc() expressions in min and max values:

```html
<!-- Leave 350px for sidebar -->
<$resizer
  max="calc(100% - 350px)"
/>

<!-- Use viewport width -->
<$resizer
  max="calc(100vw - 400px)"
/>

<!-- Complex calculations -->
<$resizer
  min="calc(20% + 100px)"
  max="calc(80% - 50px)"
/>
```

## Unit Conversion Features

The widget intelligently handles mixed units:

- Tiddlers can store values in any unit (e.g., "2.5rem", "50vh", "300px")
- Internal calculations are performed in pixels for consistency
- Values are converted back to the original unit when saved
- Maintains precision with appropriate decimal places per unit type

## Constraint Behavior

When resizing multiple tiddlers:
- If ANY tiddler would exceed min/max limits, NO tiddlers are updated
- This preserves relative relationships between tiddler values
- All tiddlers move together within the defined constraints

## Styling

The widget creates a div element with the class `tc-resizer` plus any additional classes specified. You can style it with CSS:

```css
.tc-resizer {
  cursor: ew-resize; /* or ns-resize for vertical */
  width: 5px;
  background: #ccc;
  position: relative;
}

.tc-resizer:hover {
  background: #999;
}

.tc-resizer-active {
  background: #666;
}
```

During resize operations:
- `.tc-resizing` class is added to the body element
- `.tc-resizer-active` class is added to the active resizer
- `.tc-resize-overlay` overlay captures pointer events

## Layout Procedures

The resizer plugin includes several pre-built layout procedures that make it easy to create common split-panel layouts:

### horizontal-split-panel

Creates a horizontally split layout with a resizable divider between left and right panels.

```html
<<horizontal-split-panel
  leftContent:"Content for left panel"
  rightContent:"Content for right panel"
  width:"50%"
  minWidth:"100px"
  maxWidth:"80%"
  stateTiddler:"$:/state/hsplit/width"
  class:"my-panel"
  leftClass:"left-panel-class"
  rightClass:"right-panel-class"
  splitterClass:"splitter-class"
>>
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `leftContent` | Content for the left panel (variable or tiddler name) | "" |
| `rightContent` | Content for the right panel (variable or tiddler name) | "" |
| `width` | Initial width of the left panel | "50%" |
| `minHeight` | Minimum height of the panel container | "100%" |
| `minWidth` | Minimum width of the left panel | "100px" |
| `maxWidth` | Maximum width of the left panel | "80%" |
| `stateTiddler` | Tiddler to store the current width | "$:/state/hsplit/width" |
| `class` | Additional CSS classes for the container | "" |
| `leftClass` | Additional CSS classes for the left panel | "" |
| `rightClass` | Additional CSS classes for the right panel | "" |
| `splitterClass` | Additional CSS classes for the splitter | "" |

### vertical-split-panel

Creates a vertically split layout with a resizable divider between top and bottom panels.

```html
<<vertical-split-panel
  topContent:"Content for top panel"
  bottomContent:"Content for bottom panel"
  height:"50%"
  panelHeight:"100%"
  minHeight:"100px"
  maxHeight:"80%"
  stateTiddler:"$:/state/vsplit/height"
  class:"my-panel"
  topClass:"top-panel-class"
  bottomClass:"bottom-panel-class"
  splitterClass:"splitter-class"
>>
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `topContent` | Content for the top panel (variable or tiddler name) | "" |
| `bottomContent` | Content for the bottom panel (variable or tiddler name) | "" |
| `panelHeight` | Height of the entire panel container | "100%" |
| `height` | Initial height of the top panel | "50%" |
| `minHeight` | Minimum height of the top panel | "100px" |
| `maxHeight` | Maximum height of the top panel | "80%" |
| `stateTiddler` | Tiddler to store the current height | "$:/state/vsplit/height" |
| `class` | Additional CSS classes for the container | "" |
| `topClass` | Additional CSS classes for the top panel | "" |
| `bottomClass` | Additional CSS classes for the bottom panel | "" |
| `splitterClass` | Additional CSS classes for the splitter | "" |

### three-column-panels

Creates a three-column layout with resizable left and right panels, and a flexible center panel.

```html
<<three-column-panels
  leftContent:"Left panel content"
  centerContent:"Center panel content"
  rightContent:"Right panel content"
  leftWidth:"200px"
  rightWidth:"200px"
  minWidth:"150px"
  maxWidth:"400px"
  minHeight:"100%"
  leftStateTiddler:"$:/state/three-col/left"
  rightStateTiddler:"$:/state/three-col/right"
  class:"my-three-col"
>>
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `leftContent` | Content for the left panel (variable or tiddler name) | "" |
| `centerContent` | Content for the center panel (variable or tiddler name) | "" |
| `rightContent` | Content for the right panel (variable or tiddler name) | "" |
| `leftWidth` | Initial width of the left panel | "200px" |
| `rightWidth` | Initial width of the right panel | "200px" |
| `minWidth` | Minimum width for side panels | "150px" |
| `maxWidth` | Maximum width for side panels | "400px" |
| `minHeight` | Minimum height of the panel container | "100%" |
| `leftStateTiddler` | Tiddler to store the left panel width | "$:/state/three-col/left" |
| `rightStateTiddler` | Tiddler to store the right panel width | "$:/state/three-col/right" |
| `class` | Additional CSS classes for the container | "" |

Note: The center panel automatically adjusts its width based on the left and right panel sizes, with constraints to ensure all panels remain visible.

### collapsible-master-detail-panel

Creates a master-detail layout where the master panel can be collapsed to save space.

```html
<<collapsible-master-detail-panel
  masterContent:"Master panel content"
  detailContent:"Detail panel content"
  collapsed:"no"
  size:"300px"
  minSize:"200px"
  maxSize:"500px"
  minHeight:"100%"
  stateTiddler:"$:/state/cmd/size"
  collapseStateTiddler:"$:/state/cmd/collapsed"
  class:"my-master-detail"
>>
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `masterContent` | Content for the master panel (variable or tiddler name) | "" |
| `detailContent` | Content for the detail panel (variable or tiddler name) | "" |
| `collapsed` | Initial collapsed state ("yes" or "no") | "no" |
| `size` | Initial width of the master panel | "300px" |
| `minSize` | Minimum width of the master panel | "200px" |
| `maxSize` | Maximum width of the master panel | "500px" |
| `minHeight` | Minimum height of the panel container | "100%" |
| `stateTiddler` | Tiddler to store the master panel width | "$:/state/cmd/size" |
| `collapseStateTiddler` | Tiddler to store the collapsed state | "$:/state/cmd/collapsed" |
| `class` | Additional CSS classes for the container | "" |

Features:
- Collapse/expand buttons integrated into the master panel
- Detail panel automatically expands when master panel is collapsed
- State persistence for both size and collapse state

## MediaQuery Filter

The plugin includes a `mediaquery` filter operator that allows you to evaluate CSS media queries within TiddlyWiki filters. This is particularly useful for creating responsive layouts and conditional content.

### Syntax

```
[mediaquery<media-query>]
```

### Examples

```html
<!-- Show content only on mobile devices -->
<%if [mediaquery[(max-width: 768px)]] %>
  This content only appears on mobile devices
<% endif %>

<!-- Show different content for touch vs mouse devices -->
<%if [mediaquery[(pointer: coarse)]] %>
  <div class="touch-interface">
    Touch-optimized interface with larger buttons
  </div>
<% else %>
  <div class="mouse-interface">
    Mouse-optimized interface with hover states
  </div>
<% endif %>

<!-- Responsive layout based on screen size -->
<%if [mediaquery[(min-width: 1024px)]] %>
  <<three-column-panels
    leftContent:"Navigation"
    centerContent:"Main Content"
    rightContent:"Sidebar"
  >>
<% else %>
  <<vertical-split-panel
    topContent:"Navigation"
    bottomContent:"Main Content"
  >>
<% endif %>

<!-- Dark mode support -->
<%if [mediaquery[(prefers-color-scheme: dark)]] %>
  <style>
    .my-component { background: #1a1a1a; color: #ffffff; }
  </style>
<% endif %>

<!-- Responsive resizer configuration -->
<$let handleWidth={{{ [mediaquery[(pointer: coarse)]then[40px]else[10px]] }}}>
  <$resizer
    direction="horizontal"
    tiddler="$:/state/panel-width"
    default=<<handleWidth>>
  />
</$let>

<!-- Disable animations for users who prefer reduced motion -->
<%if [mediaquery[(prefers-reduced-motion: reduce)]] %>
  <style>
    * { animation: none !important; transition: none !important; }
  </style>
<% endif %>
```

### Features

- **Reactive Updates**: Automatically refreshes when media query state changes (e.g., window resize, device rotation)
- **Browser-Only**: Returns empty results when running in Node.js
- **Error Handling**: Invalid media queries return empty results
- **Negation Support**: Use `!mediaquery` to invert the condition

### Common Media Queries

- `(max-width: 768px)` - Mobile devices
- `(min-width: 769px)` - Tablets and desktops
- `(pointer: coarse)` - Touch devices
- `(pointer: fine)` - Mouse/trackpad devices  
- `(prefers-color-scheme: dark)` - Dark mode preference
- `(orientation: portrait)` - Portrait orientation
- `(orientation: landscape)` - Landscape orientation
- `(prefers-reduced-motion: reduce)` - Reduced motion preference

## Browser Compatibility

- Modern browsers with ES5 support
- Touch devices via pointer events
- MediaQueryList API support for reactive media queries
- Fallback handling for older viewport unit implementations
- Cross-browser window object detection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This plugin is released under the MIT License. See the [LICENSE](LICENSE) file for details.

## Credits

Created for the TiddlyWiki community by BTC.