# Privacy Substitute Profiles

This context names the synthetic profile data generated for people who choose not to disclose real details in forms that check field format rather than identity authenticity.

## Language

**Privacy Substitute Profile (隐私替代资料)**:
A set of fabricated personal details intended to fill form fields without disclosing the user's real details. It does not represent a verified person or establish legal identity.
_Avoid_: Real identity, verified identity

**Format Validation (格式校验)**:
A check that a value follows a field's expected structure, such as a phone-number pattern or postal-code shape; it does not confirm who the value belongs to or whether it is unused.
_Avoid_: Authenticity validation

**Profile Locale (资料地区格式)**:
The country or region conventions used for a profile's language and field formats; it does not assert that the person lives in or belongs to that place.
_Avoid_: User's actual location

**Bilingual Profile Display (资料双语展示)**:
A profile's personal-data fields are shown in the selected region's local-language form and an English transliteration or address rendering of the same synthetic profile. For US and UK profiles, the local-language form is English.
_Avoid_: English-only profile

**Coherent Profile (协调资料)**:
The profile's values are intended to fit together under the selected locale, such as an address and postal code using compatible regional formats; this does not make them real or deliverable.
_Avoid_: Independent random fields

**Format-Only Phone Number (仅格式校验的手机号)**:
A generated phone-number value that matches the selected region's expected format. Unless the value comes from a published fictional example range, it may be assigned to a real subscriber.
_Avoid_: Guaranteed fictional phone number

**Non-Deliverable Email Address (不可投递邮箱)**:
A syntactically formatted email address under a reserved invalid domain, intended not to receive messages.
_Avoid_: Reachable email address
