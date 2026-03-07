"""XSD schema validation for VDI 3682 XML."""

import logging
from pathlib import Path

from lxml import etree

logger = logging.getLogger(__name__)

_SCHEMA_DIR = Path(__file__).resolve().parent / "IndustrialStandard-XSD-VDI3682"
XSD_PATH = _SCHEMA_DIR / "FPD_Schema.xsd"


def validate_xsd(root: etree._Element) -> list[str]:
    """Validate an XML element tree against FPD_Schema.xsd.

    Uses the xmlschema library which supports XSD 1.1 (required by this schema).
    Returns a list of validation warning strings (empty if valid or schema not found).
    """
    if not XSD_PATH.is_file():
        return ["XSD schema not found — run 'git submodule update --init'"]

    try:
        import xmlschema
    except ImportError:
        logger.warning("xmlschema package not installed — skipping XSD validation")
        return ["xmlschema package not installed — install with: pip install xmlschema"]

    try:
        schema = xmlschema.XMLSchema11(str(XSD_PATH))
    except xmlschema.XMLSchemaException as exc:
        logger.warning("Could not parse XSD schema at %s: %s", XSD_PATH, exc)
        return [f"XSD schema could not be loaded: {exc}"]

    try:
        schema.validate(root)
    except xmlschema.XMLSchemaValidationError as exc:
        # Collect all errors
        errors = []
        for error in schema.iter_errors(root):
            errors.append(f"XSD validation: {error.reason}")
        return errors if errors else [f"XSD validation: {exc.reason}"]

    return []
