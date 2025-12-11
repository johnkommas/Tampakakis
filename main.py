import socket
from pathlib import Path
import xml.etree.ElementTree as ET

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")

templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    # Wider main content on the home page while keeping header/footer safe width
    return templates.TemplateResponse(
        "index.html",
        {"request": request, "main_container_class": "container--wide"},
    )


@app.get("/hello/{name}")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}


def get_ip_address():
    """
    Gets the local IP address by connecting to Google's DNS server.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    return s.getsockname()[0]

# =======================
# Thermoprosopsi catalog
# =======================

DATA_FILE = Path("data/thermoprosopsi.xml")


def ensure_data_file():
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        # Minimal default structure if missing
        DATA_FILE.write_text(
            """<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<catalog><areas/><linear/><workers/><extras/></catalog>\n""",
            encoding="utf-8",
        )


def load_catalog():
    ensure_data_file()
    tree = ET.parse(DATA_FILE)
    root = tree.getroot()

    # Migration: ensure <extras> exists with default items
    extras_el = root.find("extras")
    changed = False
    if extras_el is None:
        extras_el = ET.SubElement(root, "extras")
        changed = True
    # Seed default extras if missing
    defaults = [
        {"key": "extra_kados", "name": "Κάδος", "unit": "unit", "latest_price": 120.00},
        {"key": "extra_fatoura", "name": "Φατούρα", "unit": "m2", "latest_price": 0.00},
    ]
    existing_keys = {it.get("key") for it in extras_el.findall("item")}
    for d in defaults:
        if d["key"] not in existing_keys:
            it = ET.SubElement(extras_el, "item", {"key": d["key"]})
            ET.SubElement(it, "name").text = d["name"]
            ET.SubElement(it, "unit").text = d["unit"]
            ET.SubElement(it, "latest_price").text = f"{d['latest_price']:.2f}"
            changed = True
    if changed:
        tree.write(DATA_FILE, encoding="utf-8", xml_declaration=True)

    def parse_group(tag):
        group_el = root.find(tag)
        items = []
        if group_el is not None:
            for it in group_el.findall("item"):
                key = it.get("key")
                name = (it.findtext("name") or "").strip()
                unit = (it.findtext("unit") or "").strip()
                latest_price = float(it.findtext("latest_price") or 0)
                consumption = it.findtext("consumption")
                items.append(
                    {
                        "key": key,
                        "name": name,
                        "unit": unit,
                        "latest_price": latest_price,
                        **({"consumption": consumption} if consumption else {}),
                    }
                )
        return items

    return {
        "areas": parse_group("areas"),
        "linear": parse_group("linear"),
        "workers": parse_group("workers"),
        "extras": parse_group("extras"),
    }


def update_price_in_xml(key: str, new_price: float):
    ensure_data_file()
    tree = ET.parse(DATA_FILE)
    root = tree.getroot()

    found_el = None
    for group in ("areas", "linear", "workers", "extras"):
        grp = root.find(group)
        if grp is None:
            continue
        for it in grp.findall("item"):
            if it.get("key") == key:
                found_el = it
                break
        if found_el is not None:
            break

    if found_el is None:
        raise KeyError(f"Item with key '{key}' not found")

    lp = found_el.find("latest_price")
    if lp is None:
        lp = ET.SubElement(found_el, "latest_price")
    lp.text = f"{new_price:.2f}"

    tree.write(DATA_FILE, encoding="utf-8", xml_declaration=True)

    # Return updated snapshot
    name = (found_el.findtext("name") or "").strip()
    unit = (found_el.findtext("unit") or "").strip()
    consumption = found_el.findtext("consumption")
    return {
        "key": key,
        "name": name,
        "unit": unit,
        "latest_price": float(lp.text or 0),
        **({"consumption": consumption} if consumption else {}),
    }


# =======================
# Plakakia catalog
# =======================

PLAKAKIA_DATA_FILE = Path("data/plakakia.xml")


def ensure_plakakia_data_file():
    if not PLAKAKIA_DATA_FILE.exists():
        PLAKAKIA_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        PLAKAKIA_DATA_FILE.write_text(
            """<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<catalog><areas/><volumes/><workers/><extras/></catalog>\n""",
            encoding="utf-8",
        )


def load_plakakia_catalog():
    ensure_plakakia_data_file()
    tree = ET.parse(PLAKAKIA_DATA_FILE)
    root = tree.getroot()

    # Migration: ensure <extras> with defaults
    extras_el = root.find("extras")
    changed = False
    if extras_el is None:
        extras_el = ET.SubElement(root, "extras")
        changed = True
    defaults = [
        {"key": "extra_kados", "name": "Κάδος", "unit": "unit", "latest_price": 120.00},
        {"key": "extra_fatoura", "name": "Φατούρα", "unit": "m2", "latest_price": 0.00},
    ]
    existing_keys = {it.get("key") for it in extras_el.findall("item")}
    for d in defaults:
        if d["key"] not in existing_keys:
            it = ET.SubElement(extras_el, "item", {"key": d["key"]})
            ET.SubElement(it, "name").text = d["name"]
            ET.SubElement(it, "unit").text = d["unit"]
            ET.SubElement(it, "latest_price").text = f"{d['latest_price']:.2f}"
            changed = True
    if changed:
        tree.write(PLAKAKIA_DATA_FILE, encoding="utf-8", xml_declaration=True)

    def parse_group(tag):
        group_el = root.find(tag)
        items = []
        if group_el is not None:
            for it in group_el.findall("item"):
                key = it.get("key")
                name = (it.findtext("name") or "").strip()
                unit = (it.findtext("unit") or "").strip()
                latest_price = float(it.findtext("latest_price") or 0)
                consumption = it.findtext("consumption")
                items.append(
                    {
                        "key": key,
                        "name": name,
                        "unit": unit,
                        "latest_price": latest_price,
                        **({"consumption": consumption} if consumption else {}),
                    }
                )
        return items

    return {
        "areas": parse_group("areas"),
        "volumes": parse_group("volumes"),
        "workers": parse_group("workers"),
        "extras": parse_group("extras"),
    }


def update_plakakia_price_in_xml(key: str, new_price: float):
    ensure_plakakia_data_file()
    tree = ET.parse(PLAKAKIA_DATA_FILE)
    root = tree.getroot()

    found_el = None
    for group in ("areas", "volumes", "workers", "extras"):
        grp = root.find(group)
        if grp is None:
            continue
        for it in grp.findall("item"):
            if it.get("key") == key:
                found_el = it
                break
        if found_el is not None:
            break

    if found_el is None:
        raise KeyError(f"Item with key '{key}' not found")

    lp = found_el.find("latest_price")
    if lp is None:
        lp = ET.SubElement(found_el, "latest_price")
    lp.text = f"{new_price:.2f}"

    tree.write(PLAKAKIA_DATA_FILE, encoding="utf-8", xml_declaration=True)

    name = (found_el.findtext("name") or "").strip()
    unit = (found_el.findtext("unit") or "").strip()
    consumption = found_el.findtext("consumption")
    return {
        "key": key,
        "name": name,
        "unit": unit,
        "latest_price": float(lp.text or 0),
        **({"consumption": consumption} if consumption else {}),
    }


class UpdatePricePayload(BaseModel):
    key: str = Field(..., description="Unique key of the catalog item")
    latest_price: float = Field(..., gt=0, description="New price to persist")


@app.get("/thermoprosopsi", response_class=HTMLResponse)
async def thermoprosopsi_page(request: Request):
    return templates.TemplateResponse(
        "thermoprosopsi.html",
        {"request": request},
    )


@app.get("/api/thermoprosopsi/catalog")
async def thermoprosopsi_catalog():
    try:
        data = load_catalog()
        return JSONResponse(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/thermoprosopsi/update-price")
async def thermoprosopsi_update_price(payload: UpdatePricePayload):
    try:
        updated = update_price_in_xml(payload.key, payload.latest_price)
        return JSONResponse({"status": "ok", "item": updated})
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =======================
# Gypsosanida catalog
# =======================

GYPSO_DATA_FILE = Path("data/gypsosanida.xml")


def ensure_gypsosanida_data_file():
    if not GYPSO_DATA_FILE.exists():
        GYPSO_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        GYPSO_DATA_FILE.write_text(
            """<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<catalog><areas/><linear/><pieces/><workers/><extras/></catalog>\n""",
            encoding="utf-8",
        )


def load_gypsosanida_catalog():
    ensure_gypsosanida_data_file()
    tree = ET.parse(GYPSO_DATA_FILE)
    root = tree.getroot()

    # Migration: ensure <extras> with defaults
    extras_el = root.find("extras")
    changed = False
    if extras_el is None:
        extras_el = ET.SubElement(root, "extras")
        changed = True
    defaults = [
        {"key": "extra_kados", "name": "Κάδος", "unit": "unit", "latest_price": 120.00},
        {"key": "extra_fatoura", "name": "Φατούρα", "unit": "m2", "latest_price": 0.00},
    ]
    existing_keys = {it.get("key") for it in extras_el.findall("item")}
    for d in defaults:
        if d["key"] not in existing_keys:
            it = ET.SubElement(extras_el, "item", {"key": d["key"]})
            ET.SubElement(it, "name").text = d["name"]
            ET.SubElement(it, "unit").text = d["unit"]
            ET.SubElement(it, "latest_price").text = f"{d['latest_price']:.2f}"
            changed = True
    if changed:
        tree.write(GYPSO_DATA_FILE, encoding="utf-8", xml_declaration=True)

    def parse_group(tag):
        group_el = root.find(tag)
        items = []
        if group_el is not None:
            for it in group_el.findall("item"):
                key = it.get("key")
                name = (it.findtext("name") or "").strip()
                unit = (it.findtext("unit") or "").strip()
                latest_price = float(it.findtext("latest_price") or 0)
                consumption = it.findtext("consumption")
                items.append(
                    {
                        "key": key,
                        "name": name,
                        "unit": unit,
                        "latest_price": latest_price,
                        **({"consumption": consumption} if consumption else {}),
                    }
                )
        return items

    return {
        "areas": parse_group("areas"),
        "linear": parse_group("linear"),
        "pieces": parse_group("pieces"),
        "workers": parse_group("workers"),
        "extras": parse_group("extras"),
    }


def update_gypsosanida_price_in_xml(key: str, new_price: float):
    ensure_gypsosanida_data_file()
    tree = ET.parse(GYPSO_DATA_FILE)
    root = tree.getroot()

    found_el = None
    for group in ("areas", "linear", "pieces", "workers", "extras"):
        grp = root.find(group)
        if grp is None:
            continue
        for it in grp.findall("item"):
            if it.get("key") == key:
                found_el = it
                break
        if found_el is not None:
            break

    if found_el is None:
        raise KeyError(f"Item with key '{key}' not found")

    lp = found_el.find("latest_price")
    if lp is None:
        lp = ET.SubElement(found_el, "latest_price")
    lp.text = f"{new_price:.2f}"

    tree.write(GYPSO_DATA_FILE, encoding="utf-8", xml_declaration=True)

    name = (found_el.findtext("name") or "").strip()
    unit = (found_el.findtext("unit") or "").strip()
    consumption = found_el.findtext("consumption")
    return {
        "key": key,
        "name": name,
        "unit": unit,
        "latest_price": float(lp.text or 0),
        **({"consumption": consumption} if consumption else {}),
    }


@app.get("/gypsosanida", response_class=HTMLResponse)
async def gypsosanida_page(request: Request):
    return templates.TemplateResponse(
        "gypsosanida.html",
        {"request": request},
    )


@app.get("/api/gypsosanida/catalog")
async def gypsosanida_catalog():
    try:
        data = load_gypsosanida_catalog()
        return JSONResponse(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/gypsosanida/update-price")
async def gypsosanida_update_price(payload: UpdatePricePayload):
    try:
        updated = update_gypsosanida_price_in_xml(payload.key, payload.latest_price)
        return JSONResponse({"status": "ok", "item": updated})
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/plakakia", response_class=HTMLResponse)
async def plakakia_page(request: Request):
    return templates.TemplateResponse(
        "plakakia.html",
        {"request": request},
    )


@app.get("/api/plakakia/catalog")
async def plakakia_catalog():
    try:
        data = load_plakakia_catalog()
        return JSONResponse(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/plakakia/update-price")
async def plakakia_update_price(payload: UpdatePricePayload):
    try:
        updated = update_plakakia_price_in_xml(payload.key, payload.latest_price)
        return JSONResponse({"status": "ok", "item": updated})
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =======================
# Elaioxromatismoi page (client-side only)
# =======================

ELAIO_DATA_FILE = Path("data/elaioxromatismoi.xml")


def ensure_elaioxromatismoi_data_file():
    if not ELAIO_DATA_FILE.exists():
        ELAIO_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        ELAIO_DATA_FILE.write_text(
            """<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<catalog><workers/><extras/></catalog>\n""",
            encoding="utf-8",
        )


def load_elaioxromatismoi_catalog():
    ensure_elaioxromatismoi_data_file()
    tree = ET.parse(ELAIO_DATA_FILE)
    root = tree.getroot()

    # Migration: ensure <extras> with defaults
    changed = False
    workers_el = root.find("workers")
    if workers_el is None:
        workers_el = ET.SubElement(root, "workers")
        changed = True
    extras_el = root.find("extras")
    if extras_el is None:
        extras_el = ET.SubElement(root, "extras")
        changed = True

    # Seed default extras if missing
    extras_defaults = [
        {"key": "extra_kouvas", "name": "Κουβάς", "unit": "unit", "latest_price": 55.00},
        {"key": "extra_astari", "name": "Αστάρι", "unit": "unit", "latest_price": 50.00},
        {"key": "extra_stokos", "name": "Στόκος", "unit": "unit", "latest_price": 15.00},
        {"key": "extra_kados", "name": "Κάδος", "unit": "unit", "latest_price": 120.00},
        {"key": "extra_fatoura", "name": "Φατούρα", "unit": "m2", "latest_price": 0.00},
    ]
    existing_extras = {it.get("key") for it in extras_el.findall("item")}
    for d in extras_defaults:
        if d["key"] not in existing_extras:
            it = ET.SubElement(extras_el, "item", {"key": d["key"]})
            ET.SubElement(it, "name").text = d["name"]
            ET.SubElement(it, "unit").text = d["unit"]
            ET.SubElement(it, "latest_price").text = f"{d['latest_price']:.2f}"
            changed = True

    # Seed default workers if file created empty (safety)
    default_workers = [
        {"key": "technitis", "name": "Τεχνίτης", "unit": "day", "latest_price": 80.00},
        {"key": "voithos", "name": "Βοηθός Τεχνίτη", "unit": "day", "latest_price": 60.00},
    ]
    existing_workers = {it.get("key") for it in workers_el.findall("item")}
    for d in default_workers:
        if d["key"] not in existing_workers:
            it = ET.SubElement(workers_el, "item", {"key": d["key"]})
            ET.SubElement(it, "name").text = d["name"]
            ET.SubElement(it, "unit").text = d["unit"]
            ET.SubElement(it, "latest_price").text = f"{d['latest_price']:.2f}"
            changed = True

    if changed:
        tree.write(ELAIO_DATA_FILE, encoding="utf-8", xml_declaration=True)

    def parse_group(tag):
        group_el = root.find(tag)
        items = []
        if group_el is not None:
            for it in group_el.findall("item"):
                key = it.get("key")
                name = (it.findtext("name") or "").strip()
                unit = (it.findtext("unit") or "").strip()
                latest_price = float(it.findtext("latest_price") or 0)
                items.append({
                    "key": key,
                    "name": name,
                    "unit": unit,
                    "latest_price": latest_price,
                })
        return items

    return {"workers": parse_group("workers"), "extras": parse_group("extras")}


def update_elaioxromatismoi_price_in_xml(key: str, new_price: float):
    ensure_elaioxromatismoi_data_file()
    tree = ET.parse(ELAIO_DATA_FILE)
    root = tree.getroot()

    found_el = None
    for group in ("workers", "extras"):
        grp = root.find(group)
        if grp is not None:
            for it in grp.findall("item"):
                if it.get("key") == key:
                    found_el = it
                    break
        if found_el is not None:
            break

    if found_el is None:
        raise KeyError(f"Item with key '{key}' not found")

    lp = found_el.find("latest_price")
    if lp is None:
        lp = ET.SubElement(found_el, "latest_price")
    lp.text = f"{new_price:.2f}"

    tree.write(ELAIO_DATA_FILE, encoding="utf-8", xml_declaration=True)

    name = (found_el.findtext("name") or "").strip()
    unit = (found_el.findtext("unit") or "").strip()
    return {
        "key": key,
        "name": name,
        "unit": unit,
        "latest_price": float(lp.text or 0),
    }


@app.get("/elaioxromatismoi", response_class=HTMLResponse)
async def elaioxromatismoi_page(request: Request):
    return templates.TemplateResponse(
        "elaioxromatismoi.html",
        {"request": request},
    )


@app.get("/api/elaioxromatismoi/catalog")
async def elaioxromatismoi_catalog():
    try:
        data = load_elaioxromatismoi_catalog()
        return JSONResponse(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/elaioxromatismoi/update-price")
async def elaioxromatismoi_update_price(payload: UpdatePricePayload):
    try:
        updated = update_elaioxromatismoi_price_in_xml(payload.key, payload.latest_price)
        return JSONResponse({"status": "ok", "item": updated})
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Convenience for local development (optional)
if __name__ == "__main__":
    import uvicorn

    my_ip = get_ip_address()  # Get the actual IP address for display purposes
    uvicorn.run("main:app", host=my_ip, port=8080, reload=True)