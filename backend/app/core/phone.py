import phonenumbers
from phonenumbers import PhoneNumberFormat


class InvalidPhoneNumberError(ValueError):
    """Raised when a phone number is invalid or is not Cambodian."""


def normalize_cambodian_phone(phone: str) -> str:
    cleaned_phone = phone.strip()

    try:
        parsed_phone = phonenumbers.parse(
            cleaned_phone,
            "KH",
        )
    except phonenumbers.NumberParseException as exc:
        raise InvalidPhoneNumberError("Invalid Cambodian phone number.") from exc

    if not phonenumbers.is_valid_number(parsed_phone):
        raise InvalidPhoneNumberError("Invalid Cambodian phone number.")

    if parsed_phone.country_code != 855:
        raise InvalidPhoneNumberError("Only Cambodian phone numbers are supported.")

    return phonenumbers.format_number(
        parsed_phone,
        PhoneNumberFormat.E164,
    )
