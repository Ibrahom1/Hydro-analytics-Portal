import io
import json
import os
import re
import shutil
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
REGISTRY_PATH = DATA_DIR / "layers.json"

GEOSERVER_URL = os.getenv("GIS_GEOSERVER_URL", "http://172.18.1.85:8080/geoserver").rstrip("/")
GEOSERVER_WORKSPACE = os.getenv("GIS_GEOSERVER_WORKSPACE", "HydroAnalytics2026")
GEOSERVER_USER = os.getenv("GIS_GEOSERVER_USER", "admin")
GEOSERVER_PASSWORD = os.getenv("GIS_GEOSERVER_PASSWORD", "geoserver")
GEOSERVER_TIMEOUT = int(os.getenv("GIS_GEOSERVER_TIMEOUT", "120"))

REQUIRED_SHAPEFILE_EXTS = {".shp", ".shx", ".dbf", ".prj"}
ALLOWED_SHAPEFILE_EXTS = REQUIRED_SHAPEFILE_EXTS | {".cst", ".cpd", ".cpg", ".qmd", ".sbn", ".sbx", ".xml"}
POINT_SHAPE_TYPES = {1, 8, 11, 18, 21, 28}
LINE_SHAPE_TYPES = {3, 13, 23}
POLYGON_SHAPE_TYPES = {5, 15, 25, 31}
MAX_FILTER_VALUES = 250
MAX_FEATURE_SUMMARY_FEATURES = int(os.getenv("GIS_FEATURE_SUMMARY_MAX_FEATURES", "5000"))
MAX_FEATURE_SUMMARY_VALUES = int(os.getenv("GIS_FEATURE_SUMMARY_VALUES", "250"))
MAX_FEATURE_COLOR_VALUES = 250
NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}

STYLE_PAINT_SCHEMA: Dict[str, Dict[str, str]] = {
    "point": {
        "circle-color": "color",
        "circle-opacity": "opacity",
        "circle-radius": "number",
        "circle-stroke-color": "color",
        "circle-stroke-width": "number",
        "circle-stroke-opacity": "opacity",
    },
    "line": {
        "line-color": "color",
        "line-opacity": "opacity",
        "line-width": "number",
        "line-dasharray": "dasharray",
    },
    "fill": {
        "fill-color": "color",
        "fill-opacity": "opacity",
    },
    "outline": {
        "line-color": "color",
        "line-opacity": "opacity",
        "line-width": "number",
    },
    "raster": {
        "raster-opacity": "opacity",
    },
}

STYLE_BUCKETS_BY_LAYER: Dict[str, Tuple[str, ...]] = {
    "point": ("point",),
    "line": ("line",),
    "fill": ("fill", "outline"),
    "raster": ("raster",),
}

app = FastAPI(title="Hydro GIS Uploader API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_data_dirs() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_name(value: str, fallback: str = "uploaded_layer") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", (value or "").strip()).strip("_")
    cleaned = re.sub(r"_+", "_", cleaned)
    return (cleaned or fallback)[:80]


def unique_layer_name(display_name: str) -> str:
    return f"{sanitize_name(display_name).lower()}_{int(time.time())}"


def validate_sidebar_panel_id(panel_id: str) -> str:
    cleaned = (panel_id or "").strip()
    if not cleaned or not re.match(r"^[A-Za-z0-9_-]+$", cleaned):
        raise HTTPException(status_code=400, detail="A valid sidebar placement is required.")
    return cleaned


def validate_display_name(display_name: str) -> str:
    cleaned = (display_name or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Layer toggle name is required.")
    return cleaned[:120]


def load_registry() -> List[Dict[str, Any]]:
    ensure_data_dirs()
    if not REGISTRY_PATH.exists():
        return []
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_registry(layers: List[Dict[str, Any]]) -> None:
    ensure_data_dirs()
    REGISTRY_PATH.write_text(json.dumps(layers, indent=2), encoding="utf-8")


def no_cache_json(payload: Dict[str, Any]) -> JSONResponse:
    return JSONResponse(content=payload, headers=NO_CACHE_HEADERS)


def upsert_layer(layer: Dict[str, Any]) -> None:
    layers = [item for item in load_registry() if item.get("id") != layer["id"]]
    layers.append(layer)
    save_registry(layers)


def find_layer_or_404(layer_id: str) -> Dict[str, Any]:
    layer = next((item for item in load_registry() if item.get("id") == layer_id), None)
    if not layer:
        raise HTTPException(status_code=404, detail="Uploaded layer toggler not found.")
    return layer


def normalize_number(value: Any, field_name: str, min_value: float, max_value: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a number.")
    if number != number or number < min_value or number > max_value:
        raise HTTPException(status_code=400, detail=f"{field_name} must be between {min_value} and {max_value}.")
    return round(number, 3)


def normalize_color(value: Any, field_name: str) -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a color string.")
    cleaned = value.strip()
    if not re.match(r"^#[0-9A-Fa-f]{6}$", cleaned):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a hex color like #0ea5e9.")
    return cleaned


def normalize_dasharray(value: Any, field_name: str) -> List[float]:
    if not isinstance(value, list) or len(value) < 2 or len(value) > 4:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a dash array with 2 to 4 numbers.")
    return [normalize_number(item, field_name, 0, 20) for item in value]


def normalize_paint_value(value: Any, value_type: str, field_name: str) -> Any:
    if value_type == "color":
        return normalize_color(value, field_name)
    if value_type == "opacity":
        return normalize_number(value, field_name, 0, 1)
    if value_type == "number":
        return normalize_number(value, field_name, 0, 50)
    if value_type == "dasharray":
        return normalize_dasharray(value, field_name)
    raise HTTPException(status_code=400, detail=f"Unsupported style field: {field_name}")


def normalize_style_payload(payload: Dict[str, Any], layer: Dict[str, Any]) -> Dict[str, Any]:
    raw_style = payload.get("style") or {}
    if not isinstance(raw_style, dict):
        raise HTTPException(status_code=400, detail="style must be an object.")

    raw_paint = raw_style.get("paint") or {}
    if not isinstance(raw_paint, dict):
        raise HTTPException(status_code=400, detail="style.paint must be an object.")

    layer_style_key = "raster" if layer.get("kind") == "raster" else str(layer.get("render_type") or "")
    allowed_buckets = STYLE_BUCKETS_BY_LAYER.get(layer_style_key, ())
    if not allowed_buckets:
        raise HTTPException(status_code=400, detail="Layer type does not support style editing.")

    normalized_paint: Dict[str, Dict[str, Any]] = {}
    for bucket, values in raw_paint.items():
        if bucket not in STYLE_PAINT_SCHEMA:
            raise HTTPException(status_code=400, detail=f"Unsupported style bucket: {bucket}")
        if bucket not in allowed_buckets:
            if values:
                raise HTTPException(status_code=400, detail=f"{bucket} style is not supported for this layer.")
            continue
        if not isinstance(values, dict):
            raise HTTPException(status_code=400, detail=f"style.paint.{bucket} must be an object.")

        allowed_fields = STYLE_PAINT_SCHEMA[bucket]
        normalized_values: Dict[str, Any] = {}
        for paint_name, paint_value in values.items():
            if paint_name not in allowed_fields:
                raise HTTPException(status_code=400, detail=f"Unsupported paint property: {bucket}.{paint_name}")
            normalized_values[paint_name] = normalize_paint_value(
                paint_value,
                allowed_fields[paint_name],
                f"{bucket}.{paint_name}",
            )
        if normalized_values:
            normalized_paint[bucket] = normalized_values

    return {"paint": normalized_paint}


def normalize_filter_payload(payload: Dict[str, Any], layer: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw_filter = payload.get("filter")
    if raw_filter in (None, "", {}):
        return None
    if layer.get("kind") != "vector":
        raise HTTPException(status_code=400, detail="Filters are only supported for uploaded vector layers.")
    if not isinstance(raw_filter, dict):
        raise HTTPException(status_code=400, detail="filter must be an object.")

    field_name = str(raw_filter.get("field") or "").strip()
    if not field_name:
        return None
    if not re.match(r"^[^<>]{1,160}$", field_name):
        raise HTTPException(status_code=400, detail="filter.field contains unsupported characters.")

    raw_values = raw_filter.get("values")
    if not isinstance(raw_values, list):
        raise HTTPException(status_code=400, detail="filter.values must be a list.")

    values: List[Any] = []
    seen = set()
    for raw_value in raw_values:
        if raw_value is None:
            continue
        if isinstance(raw_value, bool):
            value: Any = raw_value
            value_key = ("bool", raw_value)
        elif isinstance(raw_value, (int, float)):
            value = raw_value
            value_key = ("number", str(raw_value))
        else:
            value = str(raw_value).strip()
            if not value:
                continue
            value = value[:240]
            value_key = ("string", value)

        if value_key in seen:
            continue
        seen.add(value_key)
        values.append(value)
        if len(values) >= MAX_FILTER_VALUES:
            break

    if not values:
        return None
    return {"field": field_name, "values": values}


def normalize_field_name(raw_field: Any, label: str) -> str:
    field_name = str(raw_field or "").strip()
    if not field_name:
        return ""
    if not re.match(r"^[^<>]{1,160}$", field_name):
        raise HTTPException(status_code=400, detail=f"{label} contains unsupported characters.")
    return field_name


def normalize_feature_colors_payload(payload: Dict[str, Any], layer: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw_config = payload.get("feature_colors")
    if raw_config in (None, "", {}):
        return None
    if layer.get("kind") != "vector":
        raise HTTPException(status_code=400, detail="Feature colors are only supported for uploaded vector layers.")
    if not isinstance(raw_config, dict):
        raise HTTPException(status_code=400, detail="feature_colors must be an object.")

    field_name = normalize_field_name(raw_config.get("field"), "feature_colors.field")
    if not field_name:
        return None

    raw_colors = raw_config.get("colors") or {}
    if not isinstance(raw_colors, dict):
        raise HTTPException(status_code=400, detail="feature_colors.colors must be an object.")

    colors: Dict[str, str] = {}
    for raw_value, raw_color in raw_colors.items():
        value = str(raw_value).strip()
        if not value:
            continue
        colors[value[:240]] = normalize_color(raw_color, "feature_colors.colors")
        if len(colors) >= MAX_FEATURE_COLOR_VALUES:
            break

    if not colors:
        return None
    return {"field": field_name, "colors": colors}


def normalize_label_payload(payload: Dict[str, Any], layer: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    raw_label = payload.get("label")
    if raw_label in (None, "", {}):
        return None
    if layer.get("kind") != "vector":
        raise HTTPException(status_code=400, detail="Labels are only supported for uploaded vector layers.")
    if not isinstance(raw_label, dict):
        raise HTTPException(status_code=400, detail="label must be an object.")

    enabled = bool(raw_label.get("enabled"))
    field_name = normalize_field_name(raw_label.get("field"), "label.field")
    if not enabled or not field_name:
        return None

    return {
        "enabled": True,
        "field": field_name,
        "color": normalize_color(raw_label.get("color") or "#ffffff", "label.color"),
        "size": normalize_number(raw_label.get("size", 12), "label.size", 8, 36),
        "haloColor": normalize_color(raw_label.get("haloColor") or "#000000", "label.haloColor"),
        "haloWidth": normalize_number(raw_label.get("haloWidth", 1), "label.haloWidth", 0, 8),
    }


def fetch_vector_feature_collection(layer: Dict[str, Any], max_features: Optional[int] = None) -> Dict[str, Any]:
    if layer.get("kind") != "vector":
        raise HTTPException(status_code=400, detail="Uploaded vector layer not found.")

    params: Dict[str, Any] = {
        "service": "WFS",
        "version": "1.0.0",
        "request": "GetFeature",
        "typeName": layer["qualified_layer_name"],
        "outputFormat": "application/json",
    }
    if max_features:
        params["maxFeatures"] = max_features

    response = requests.get(
        f"{GEOSERVER_URL}/{GEOSERVER_WORKSPACE}/ows",
        params=params,
        auth=(GEOSERVER_USER, GEOSERVER_PASSWORD),
        timeout=GEOSERVER_TIMEOUT,
    )
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"GeoServer WFS request failed with {response.status_code}: {response.text[:700]}",
        )

    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="GeoServer WFS response was not valid JSON.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="GeoServer WFS response was not a GeoJSON object.")
    return payload


def feature_value_key(value: Any) -> Tuple[str, str]:
    if isinstance(value, bool):
        return ("bool", "true" if value else "false")
    if isinstance(value, (int, float)):
        return ("number", str(value))
    return ("string", str(value))


def summarize_feature_properties(feature_collection: Dict[str, Any]) -> List[Dict[str, Any]]:
    values_by_field: Dict[str, List[Any]] = {}
    seen_by_field: Dict[str, set] = {}

    for feature in feature_collection.get("features") or []:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        if not isinstance(properties, dict):
            continue
        for field_name, raw_value in properties.items():
            if raw_value is None or isinstance(raw_value, (dict, list)):
                continue
            field = str(field_name)
            values = values_by_field.setdefault(field, [])
            if len(values) >= MAX_FEATURE_SUMMARY_VALUES:
                continue
            seen = seen_by_field.setdefault(field, set())
            value_key = feature_value_key(raw_value)
            if value_key in seen:
                continue
            seen.add(value_key)
            values.append(raw_value)

    fields = []
    for field_name in sorted(values_by_field.keys(), key=lambda value: value.lower()):
        fields.append(
            {
                "name": field_name,
                "values": sorted(values_by_field[field_name], key=lambda value: str(value).lower()),
            }
        )
    return fields


def geoserver_rest_url(path: str) -> str:
    return f"{GEOSERVER_URL}/rest/{path.lstrip('/')}"


def geoserver_request(
    method: str,
    path: str,
    expected: Tuple[int, ...] = (200,),
    **kwargs: Any,
) -> requests.Response:
    response = requests.request(
        method,
        geoserver_rest_url(path),
        auth=(GEOSERVER_USER, GEOSERVER_PASSWORD),
        timeout=GEOSERVER_TIMEOUT,
        **kwargs,
    )
    if response.status_code not in expected:
        detail = response.text[:700] if response.text else response.reason
        raise HTTPException(
            status_code=502,
            detail=f"GeoServer {method} {path} failed with {response.status_code}: {detail}",
        )
    return response


def geoserver_delete_if_exists(path: str, label: str) -> Dict[str, Any]:
    response = requests.delete(
        geoserver_rest_url(path),
        auth=(GEOSERVER_USER, GEOSERVER_PASSWORD),
        timeout=GEOSERVER_TIMEOUT,
    )
    if response.status_code in (200, 202, 204):
        return {"target": label, "deleted": True, "status": response.status_code}
    if response.status_code == 404:
        return {"target": label, "deleted": False, "status": 404, "missing": True}

    detail = response.text[:700] if response.text else response.reason
    raise HTTPException(
        status_code=502,
        detail=f"GeoServer DELETE {path} failed with {response.status_code}: {detail}",
    )


def cleanup_local_upload(layer: Dict[str, Any]) -> None:
    layer_name = sanitize_name(layer.get("layer_name") or layer.get("id") or "")
    if not layer_name:
        return

    if layer.get("kind") == "raster":
        shutil.rmtree(UPLOAD_DIR / "raster" / layer_name, ignore_errors=True)
        return

    if layer.get("kind") == "vector":
        vector_zip = UPLOAD_DIR / "vector" / f"{layer_name}.zip"
        try:
            vector_zip.unlink(missing_ok=True)
        except Exception:
            pass


def delete_geoserver_published_layer(layer: Dict[str, Any]) -> Dict[str, Any]:
    layer_name = sanitize_name(layer.get("layer_name") or layer.get("id") or "")
    layer_kind = layer.get("kind")
    if not layer_name:
        raise HTTPException(status_code=400, detail="Uploaded layer is missing its GeoServer layer name.")

    cleanup: Dict[str, Any] = {"geoserver": []}
    if layer_kind == "raster":
        cleanup["geoserver"].append(
            geoserver_delete_if_exists(
                f"workspaces/{GEOSERVER_WORKSPACE}/coveragestores/{layer_name}?recurse=true&purge=all",
                f"coverage store {GEOSERVER_WORKSPACE}:{layer_name}",
            )
        )
        style_name = sanitize_name(layer.get("style_name") or f"{layer_name}_style")
        if style_name:
            cleanup["geoserver"].append(
                geoserver_delete_if_exists(
                    f"workspaces/{GEOSERVER_WORKSPACE}/styles/{style_name}?purge=true",
                    f"style {GEOSERVER_WORKSPACE}:{style_name}",
                )
            )
    elif layer_kind == "vector":
        cleanup["geoserver"].append(
            geoserver_delete_if_exists(
                f"workspaces/{GEOSERVER_WORKSPACE}/datastores/{layer_name}?recurse=true&purge=all",
                f"datastore {GEOSERVER_WORKSPACE}:{layer_name}",
            )
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported uploaded layer kind: {layer_kind}")

    cleanup_local_upload(layer)
    return cleanup


def ensure_workspace() -> None:
    response = requests.get(
        geoserver_rest_url(f"workspaces/{GEOSERVER_WORKSPACE}.json"),
        auth=(GEOSERVER_USER, GEOSERVER_PASSWORD),
        timeout=GEOSERVER_TIMEOUT,
    )
    if response.status_code == 200:
        return
    if response.status_code != 404:
        raise HTTPException(
            status_code=502,
            detail=f"GeoServer workspace check failed with {response.status_code}: {response.text[:700]}",
        )

    geoserver_request(
        "POST",
        "workspaces",
        expected=(200, 201),
        json={"workspace": {"name": GEOSERVER_WORKSPACE}},
        headers={"Content-Type": "application/json"},
    )


def find_shapefile_parts(zip_bytes: bytes) -> Tuple[str, Dict[str, str], str]:
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            files = [name for name in archive.namelist() if not name.endswith("/")]
            by_stem: Dict[str, Dict[str, str]] = {}
            for name in files:
                filename = Path(name).name
                if not filename:
                    continue
                suffix = Path(filename).suffix.lower()
                stem = Path(filename).stem.lower()
                if suffix in ALLOWED_SHAPEFILE_EXTS:
                    by_stem.setdefault(stem, {})[suffix] = name

            candidates = {
                stem: parts
                for stem, parts in by_stem.items()
                if REQUIRED_SHAPEFILE_EXTS.issubset(set(parts.keys()))
            }
            if not candidates:
                raise HTTPException(
                    status_code=400,
                    detail="Vector zip must contain .shp, .shx, .dbf, and .prj files for one shapefile.",
                )
            if len(candidates) > 1:
                raise HTTPException(
                    status_code=400,
                    detail="Vector zip contains multiple shapefiles. Upload one shapefile per zip.",
                )

            stem, parts = next(iter(candidates.items()))
            render_type = detect_shapefile_render_type(archive.read(parts[".shp"]))
            return stem, parts, render_type
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Vector upload must be a valid .zip file.")


def detect_shapefile_render_type(shp_bytes: bytes) -> str:
    if len(shp_bytes) < 36:
        raise HTTPException(status_code=400, detail="The .shp file is too small or invalid.")
    shape_type = int.from_bytes(shp_bytes[32:36], byteorder="little", signed=True)
    if shape_type in POINT_SHAPE_TYPES:
        return "point"
    if shape_type in LINE_SHAPE_TYPES:
        return "line"
    if shape_type in POLYGON_SHAPE_TYPES:
        return "fill"
    raise HTTPException(status_code=400, detail=f"Unsupported shapefile geometry type: {shape_type}.")


def repack_shapefile_zip(zip_bytes: bytes, parts: Dict[str, str], layer_name: str) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        for suffix, member_name in parts.items():
            target.writestr(f"{layer_name}{suffix}", source.read(member_name))
    return output.getvalue()


def upload_workspace_style(style_name: str, sld_bytes: bytes) -> None:
    ensure_workspace()
    style_path = f"workspaces/{GEOSERVER_WORKSPACE}/styles/{style_name}.json"
    response = requests.get(
        geoserver_rest_url(style_path),
        auth=(GEOSERVER_USER, GEOSERVER_PASSWORD),
        timeout=GEOSERVER_TIMEOUT,
    )
    if response.status_code == 404:
        style_xml = f"<style><name>{style_name}</name><filename>{style_name}.sld</filename></style>"
        geoserver_request(
            "POST",
            f"workspaces/{GEOSERVER_WORKSPACE}/styles",
            expected=(200, 201),
            data=style_xml.encode("utf-8"),
            headers={"Content-Type": "application/xml"},
        )
    elif response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"GeoServer style check failed with {response.status_code}: {response.text[:700]}",
        )

    geoserver_request(
        "PUT",
        f"workspaces/{GEOSERVER_WORKSPACE}/styles/{style_name}",
        expected=(200, 201),
        data=sld_bytes,
        headers={"Content-Type": "application/vnd.ogc.sld+xml"},
    )


def set_layer_default_style(layer_name: str, style_name: str) -> None:
    payload = {"layer": {"defaultStyle": {"name": style_name, "workspace": GEOSERVER_WORKSPACE}}}
    geoserver_request(
        "PUT",
        f"layers/{GEOSERVER_WORKSPACE}:{layer_name}.json",
        expected=(200,),
        json=payload,
        headers={"Content-Type": "application/json"},
    )


def layer_metadata_base(
    layer_id: str,
    display_name: str,
    sidebar_panel_id: str,
    layer_kind: str,
    layer_name: str,
) -> Dict[str, Any]:
    return {
        "id": layer_id,
        "display_name": display_name,
        "sidebar_panel_id": sidebar_panel_id,
        "kind": layer_kind,
        "workspace": GEOSERVER_WORKSPACE,
        "layer_name": layer_name,
        "qualified_layer_name": f"{GEOSERVER_WORKSPACE}:{layer_name}",
        "created_at": now_iso(),
    }


def vector_proxy_url(layer_id: str) -> str:
    return f"http://localhost:8001/api/gis/layers/{layer_id}/geojson"


def raster_wms_tile_url(layer_name: str, style_name: str) -> str:
    return (
        f"{GEOSERVER_URL}/{GEOSERVER_WORKSPACE}/wms?"
        "service=WMS&version=1.1.0&request=GetMap"
        f"&layers={GEOSERVER_WORKSPACE}:{layer_name}"
        f"&styles={style_name}"
        "&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857"
        "&format=image/png&transparent=true"
    )


@app.get("/api/gis/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "Hydro GIS Uploader API",
        "geoserver_url": GEOSERVER_URL,
        "workspace": GEOSERVER_WORKSPACE,
    }


@app.get("/api/gis/layers")
def list_layers() -> JSONResponse:
    return no_cache_json({"layers": load_registry()})


@app.delete("/api/gis/layers/{layer_id}")
def delete_layer(layer_id: str) -> Dict[str, Any]:
    layers = load_registry()
    layer = next((item for item in layers if item.get("id") == layer_id), None)
    if not layer:
        raise HTTPException(status_code=404, detail="Uploaded layer toggler not found.")

    cleanup = delete_geoserver_published_layer(layer)
    save_registry([item for item in layers if item.get("id") != layer_id])
    return {"deleted": True, "layer": layer, "cleanup": cleanup}


@app.patch("/api/gis/layers/{layer_id}/style")
def update_layer_style(layer_id: str, payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object.")

    layers = load_registry()
    layer_index = next((index for index, item in enumerate(layers) if item.get("id") == layer_id), None)
    if layer_index is None:
        raise HTTPException(status_code=404, detail="Uploaded layer toggler not found.")

    layer = dict(layers[layer_index])
    style = normalize_style_payload(payload, layer)
    filter_config = normalize_filter_payload(payload, layer)
    feature_colors = normalize_feature_colors_payload(payload, layer)
    label_config = normalize_label_payload(payload, layer)

    if style.get("paint"):
        layer["style"] = style
    else:
        layer.pop("style", None)

    if filter_config:
        layer["filter"] = filter_config
    else:
        layer.pop("filter", None)

    if feature_colors:
        layer["feature_colors"] = feature_colors
    else:
        layer.pop("feature_colors", None)

    if label_config:
        layer["label"] = label_config
    else:
        layer.pop("label", None)

    layer["updated_at"] = now_iso()
    layers[layer_index] = layer
    save_registry(layers)
    return no_cache_json({"layer": layer})


@app.get("/api/gis/layers/{layer_id}/feature-summary")
def get_layer_feature_summary(layer_id: str) -> Dict[str, Any]:
    layer = find_layer_or_404(layer_id)
    if layer.get("kind") != "vector":
        raise HTTPException(status_code=400, detail="Feature summaries are only available for uploaded vector layers.")

    feature_collection = fetch_vector_feature_collection(layer, MAX_FEATURE_SUMMARY_FEATURES)
    fields = summarize_feature_properties(feature_collection)
    return {
        "layer_id": layer_id,
        "feature_count": len(feature_collection.get("features") or []),
        "fields": fields,
    }


@app.get("/api/gis/layers/{layer_id}/geojson")
def proxy_vector_geojson(layer_id: str) -> Response:
    layer = find_layer_or_404(layer_id)
    if not layer or layer.get("kind") != "vector":
        raise HTTPException(status_code=404, detail="Uploaded vector layer not found.")

    feature_collection = fetch_vector_feature_collection(layer)
    return Response(content=json.dumps(feature_collection), media_type="application/json")


@app.post("/api/gis/upload/vector")
async def upload_vector(
    display_name: str = Form(...),
    sidebar_panel_id: str = Form(...),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    display_name = validate_display_name(display_name)
    sidebar_panel_id = validate_sidebar_panel_id(sidebar_panel_id)
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Vector upload requires one zipped shapefile.")

    zip_bytes = await file.read()
    _, parts, render_type = find_shapefile_parts(zip_bytes)
    layer_name = unique_layer_name(display_name)
    repacked_zip = repack_shapefile_zip(zip_bytes, parts, layer_name)

    ensure_workspace()
    upload_path = UPLOAD_DIR / "vector"
    upload_path.mkdir(parents=True, exist_ok=True)
    (upload_path / f"{layer_name}.zip").write_bytes(repacked_zip)

    geoserver_request(
        "PUT",
        f"workspaces/{GEOSERVER_WORKSPACE}/datastores/{layer_name}/file.shp?configure=all&update=overwrite",
        expected=(200, 201, 202),
        data=repacked_zip,
        headers={"Content-Type": "application/zip"},
    )

    metadata = layer_metadata_base(layer_name, display_name, sidebar_panel_id, "vector", layer_name)
    metadata.update(
        {
            "render_type": render_type,
            "geojson_url": vector_proxy_url(layer_name),
        }
    )
    upsert_layer(metadata)
    return {"layer": metadata}


@app.post("/api/gis/upload/raster")
async def upload_raster(
    display_name: str = Form(...),
    sidebar_panel_id: str = Form(...),
    raster_file: UploadFile = File(...),
    sld_file: UploadFile = File(...),
) -> Dict[str, Any]:
    display_name = validate_display_name(display_name)
    sidebar_panel_id = validate_sidebar_panel_id(sidebar_panel_id)

    raster_name = raster_file.filename or ""
    sld_name = sld_file.filename or ""
    if not raster_name.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="Raster upload requires a .tif or .tiff file.")
    if not sld_name.lower().endswith(".sld"):
        raise HTTPException(status_code=400, detail="Raster upload requires a .sld style file.")

    raster_bytes = await raster_file.read()
    sld_bytes = await sld_file.read()
    if not raster_bytes:
        raise HTTPException(status_code=400, detail="Raster file is empty.")
    if not sld_bytes:
        raise HTTPException(status_code=400, detail="SLD file is empty.")

    layer_name = unique_layer_name(display_name)
    style_name = f"{layer_name}_style"

    ensure_workspace()
    upload_path = UPLOAD_DIR / "raster" / layer_name
    upload_path.mkdir(parents=True, exist_ok=True)
    (upload_path / raster_name).write_bytes(raster_bytes)
    (upload_path / f"{style_name}.sld").write_bytes(sld_bytes)

    upload_workspace_style(style_name, sld_bytes)
    geoserver_request(
        "PUT",
        f"workspaces/{GEOSERVER_WORKSPACE}/coveragestores/{layer_name}/file.geotiff?coverageName={layer_name}&configure=all&update=overwrite",
        expected=(200, 201, 202),
        data=raster_bytes,
        headers={"Content-Type": "image/tiff"},
    )
    set_layer_default_style(layer_name, style_name)

    metadata = layer_metadata_base(layer_name, display_name, sidebar_panel_id, "raster", layer_name)
    metadata.update(
        {
            "style_name": style_name,
            "wms_tile_url": raster_wms_tile_url(layer_name, style_name),
        }
    )
    upsert_layer(metadata)
    return {"layer": metadata}
