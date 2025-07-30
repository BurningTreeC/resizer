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
| `tiddler` | Target tiddler(s) - can be a filter expression | - |
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
| `aspectRatio` | Maintain aspect ratio (e.g., "16:9" or "1.5") | - |

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

### Space-Separated Tiddler List

```html
<$resizer
  direction="horizontal"
  tiddler="$:/metrics/storyright $:/metrics/storywidth $:/metrics/tiddlerwidth"
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

### Aspect Ratio Constrained

```html
<$resizer
  direction="horizontal"
  tiddler="$:/state/image/size"
  property="width"
  aspectRatio="16:9"
/>
```

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

## Browser Compatibility

- Modern browsers with ES5 support
- Touch devices via pointer events
- Fallback handling for older viewport unit implementations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This plugin is released under the MIT License. See the [LICENSE](LICENSE) file for details.

## Credits

Created for the TiddlyWiki community by BTC.