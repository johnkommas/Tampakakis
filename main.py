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
            """<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<catalog><areas/><linear/><workers/></catalog>\n""",
            encoding="utf-8",
        )


def load_catalog():
    ensure_data_file()
    tree = ET.parse(DATA_FILE)
    root = tree.getroot()

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
    }


def update_price_in_xml(key: str, new_price: float):
    ensure_data_file()
    tree = ET.parse(DATA_FILE)
    root = tree.getroot()

    found_el = None
    for group in ("areas", "linear", "workers"):
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

# Convenience for local development (optional)
if __name__ == "__main__":
    import uvicorn

    my_ip = get_ip_address()  # Get the actual IP address for display purposes
    uvicorn.run("main:app", host=my_ip, port=8080, reload=True)