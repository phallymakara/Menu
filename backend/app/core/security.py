from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """
    Hashes a plain text password using the recommended hashing algorithm.

    Args:
        password: The raw password string to hash.

    Returns:
        The secure hashed string representation of the password.
    """
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """
    Verifies a plain text password against a stored hash.

    Args:
        plain_password: The raw password input to check.
        hashed_password: The existing hashed password to compare against.

    Returns:
        True if the passwords match, False otherwise.
    """
    return password_hash.verify(
        plain_password,
        hashed_password,
    )
