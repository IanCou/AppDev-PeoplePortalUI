/**
 * Validates that a full name contains both first and last names.
 * @param fullName - The full name to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateFullName(fullName: string): { isValid: boolean; error?: string } {
    if (!fullName || typeof fullName !== 'string') {
        return { isValid: false, error: 'Full name is required' };
    }

    const trimmed = fullName.trim();
    const parts = trimmed.split(/\s+/).filter(part => part.length > 0);

    if (parts.length < 2) {
        return { isValid: false, error: 'Please provide both first and last name' };
    }

    return { isValid: true };
}

/**
 * Normalizes an email address to lowercase for consistent handling.
 * Note: Full normalization happens on the backend.
 * @param email - The email address to normalize
 * @returns The normalized email address
 */
export function normalizeEmailInput(email: string): string {
    if (!email) return email;
    return email.trim().toLowerCase();
}
