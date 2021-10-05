var stylegen = require('./stylegen');
var InspectButton = require('./InspectButton');
var isEqual = require('lodash.isequal');
var renderPopup = require('./renderPopup');
var colors = require('./colors');

function isInspectStyle(style) {
  return style.metadata && style.metadata['maplibregl-inspect:inspect'];
}

function markInspectStyle(style) {
  return Object.assign(style, {
    metadata: Object.assign({}, style.metadata, {
      'maplibregl-inspect:inspect': true
    })
  });
}

function fixRasterSource(source) {
  if (source.type === 'raster' && source.tileSize && source.tiles) {
    return {
      type: source.type,
      tileSize: source.tileSize,
      tiles: source.tiles
    };
  }
  if (source.type === 'raster' && source.url) {
    return {
      type: source.type,
      url: source.url
    };
  }
  return source;
}

//TODO: We can remove this at some point in the future
function fixStyle(style) {
  Object.keys(style.sources).forEach(function (sourceId) {
    style.sources[sourceId] = fixRasterSource(style.sources[sourceId]);
  });
  return style;
}

function MaplibreInspect(options) {
  if (!(this instanceof MaplibreInspect)) {
    throw new Error('MaplibreInspect needs to be called with the new keyword');
  }

  var popup = null;
  if (window.maplibregl) {
    popup = new window.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false
    });
  } else if (!options.popup) {
    console.error('Maplibre GL JS can not be found. Make sure to include it or pass an initialized maplibregl Popup to MaplibreInspect if you are using moduleis.');
  }

  this.options = Object.assign({
    showInspectMap: false,
    showInspectButton: true,
    showInspectMapPopup: true,
    showMapPopup: false,
    backgroundColor: '#fff',
    assignLayerColor: colors.brightColor,
    buildInspectStyle: stylegen.generateInspectStyle,
    renderPopup: renderPopup,
    popup: popup
  }, options);

  this.sources = {};
  this.assignLayerColor = this.options.assignLayerColor;
  this.toggleInspector = this.toggleInspector.bind(this);
  this._popup = this.options.popup;
  this._showInspectMap = this.options.showInspectMap;
  this._onSourceChange = this._onSourceChange.bind(this);
  this._onMousemove = this._onMousemove.bind(this);
  this._onStyleChange = this._onStyleChange.bind(this);

  this._originalStyle = null;
  this._toggle = new InspectButton({
    show: this.options.showInspectButton,
    onToggle: this.toggleInspector.bind(this)
  });
}

MaplibreInspect.prototype.toggleInspector = function () {
  this._showInspectMap = !this._showInspectMap;
  this.render();
};

MaplibreInspect.prototype._inspectStyle = function () {
  var coloredLayers = stylegen.generateColoredLayers(this.sources, this.assignLayerColor);
  return this.options.buildInspectStyle(this._map.getStyle(), coloredLayers, {
    backgroundColor: this.options.backgroundColor
  });
};

MaplibreInspect.prototype.render = function () {
  if (this._showInspectMap) {
    this._map.setStyle(fixStyle(markInspectStyle(this._inspectStyle())));
    this._toggle.setMapIcon();
  } else if (this._originalStyle) {
    if (this._popup) this._popup.remove();
    this._map.setStyle(fixStyle(this._originalStyle));
    this._toggle.setInspectIcon();
  }
};

MaplibreInspect.prototype._onSourceChange = function () {
  var sources = this.sources;
  var map = this._map;
  var previousSources = Object.assign({}, sources);

  //NOTE: This heavily depends on the internal API of Maplibre GL
  //so this breaks between Maplibre GL JS releases
  Object.keys(map.style.sourceCaches).forEach(function (sourceId) {
    var layerIds = map.style.sourceCaches[sourceId]._source.vectorLayerIds;
    if (layerIds) {
      sources[sourceId] = layerIds;
    }
  });

  if (!isEqual(previousSources, sources)) {
    this.render();
  }
};

MaplibreInspect.prototype._onStyleChange = function () {
  var style = this._map.getStyle();
  if (!isInspectStyle(style)) {
    this._originalStyle = style;
    this.render();
  }
};

MaplibreInspect.prototype._onMousemove = function (e) {
  if (!this.options.showInspectMapPopup && this._showInspectMap) return;
  if (!this.options.showMapPopup && !this._showInspectMap) return;

  var features = this._map.queryRenderedFeatures(e.point);
  this._map.getCanvas().style.cursor = (features.length) ? 'pointer' : '';

  if (!features.length && this._popup) {
    this._popup.remove();
  } else if (this._popup) {
    this._popup.setLngLat(e.lngLat)
      .setHTML(this.options.renderPopup(features))
      .addTo(this._map);
  }
};

MaplibreInspect.prototype.onAdd = function (map) {
  this._map = map;
  map.on('styledata', this._onStyleChange);
  map.on('load', this._onStyleChange);
  map.on('tiledata', this._onSourceChange);
  map.on('sourcedata', this._onSourceChange);
  map.on('mousemove', this._onMousemove);
  return this._toggle.elem;
};

MaplibreInspect.prototype.onRemove = function () {
  this._map.off('styledata', this._onStyleChange);
  this._map.off('load', this._onStyleChange);
  this._map.off('tiledata', this._onSourceChange);
  this._map.off('sourcedata', this._onSourceChange);
  this._map.off('mousemove', this._onMousemove);

  var elem = this._toggle.elem;
  elem.parentNode.removeChild(elem);
  this._map = undefined;
};

module.exports = MaplibreInspect;
