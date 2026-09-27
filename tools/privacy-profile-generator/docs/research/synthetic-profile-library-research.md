# Synthetic Profile Generator: Library and Identifier Research

**Research date:** 2026-09-27
**Scope:** Comparative research for browser-local generation in mainland China, the United States, the United Kingdom, Japan, and South Korea; native-language and English presentation; format-only validation; published test-only phone/card values.

## Findings at a glance

- [`@faker-js/faker`](https://github.com/faker-js/faker) is a good browser-side source for names, addresses, dates, email-like values, and common phone formats. Current locales include `zh_CN`, `en_US`, `en_GB`, `ja`, and `ko`; the Japanese locale is keyed as `ja`, and the Korean locale as `ko`. Its output is realistic-looking synthetic data, not a promise that a value is unassigned or unique.
- Faker produces one locale's value at a time. Its locale data does not provide paired English translations or transliterations for each name/address. Keep bilingual UI labels separate from data values; paired romanized/transliterated values would need explicit rules and coverage checks.
- [`libphonenumber-js`](https://github.com/catamphetamine/libphonenumber-js) is a compact, browser-usable MIT-licensed formatter/parser/numbering-plan validator. It can check whether a value fits current numbering metadata; it does not generate numbers or establish that a number is unassigned, unreachable, or not owned by a person. That last point is an inference from its documented metadata-based parsing/validation API.
- There are official, non-working/documentation ranges for US and UK phone-number examples. I found no official, general-purpose fictional mobile-number range for mainland China or Japan. South Korea's KOFIC offers a small pool for film productions through an application/loan service, not as unrestricted web-form test data.
- Faker also exposes generic credit-card/CVV and bank-account-number methods. Those APIs do not identify provider-approved test data. Payment-card test values are processor-specific sandbox fixtures; Stripe explicitly requires test API keys. They should not be presented as generally usable card details for arbitrary live sites.

## Candidate libraries

| Library | Browser fit | Coverage and role | License | Assessment |
| --- | --- | --- | --- | --- |
| `@faker-js/faker` | Official docs show browser imports and running it in a browser. The full package is documented as over 5 MiB minified, so import only needed locales/modules and check the built bundle. | Names, localized address pieces, postcode and phone formatting, email-like values, dates, and generic finance values. See locale coverage below. | MIT. | Recommended as the base data source, with product-owned assembly and safety rules. |
| `libphonenumber-js` | Can be used in browser bundles or via a script tag; offers ES6-targeted builds for modern browsers. | Parses and formats phone numbers and checks number-plan plausibility/validity across regions; does not generate a safe fictional number. | MIT. Its README notes that Google's upstream `libphonenumber` is Apache-2.0. | Recommended only for formatting/format validation, not as a source of phone values or proof of non-assignment. |
| Google `libphonenumber` JavaScript port | Browser demo/source exists, but the project README describes the JS build as tied to Closure and significantly larger than the rewrite. | International parse, format, and validate. | Apache-2.0 (the project also contains a small number of Chromium-derived files with a separate BSD-style notice). | More library than this browser tool likely needs; use `libphonenumber-js` if a client-side validator is needed. |

Sources: [Faker browser usage](https://github.com/faker-js/faker/blob/next/docs/guide/usage.md), [Faker localization](https://fakerjs.dev/guide/localization), [Faker license](https://github.com/faker-js/faker/blob/next/LICENSE), [libphonenumber-js README](https://github.com/catamphetamine/libphonenumber-js), [libphonenumber-js license](https://github.com/catamphetamine/libphonenumber-js/blob/master/LICENSE), [Google libphonenumber README](https://github.com/google/libphonenumber), [Google libphonenumber licenses](https://github.com/google/libphonenumber/blob/master/LICENSE).

## Locale and bilingual coverage

Faker's current locale documentation lists the requested coverage:

| Region | Faker locale | Officially listed common localized methods |
| --- | --- | --- |
| China | `zh_CN` / `fakerZH_CN` | `person.fullName`, `location.streetAddress`, `city`, `state`, `zipCode`, `phone.number`, and common internet/date methods |
| United States | `en_US` / `fakerEN_US` | Same common methods, including name, street address, city, state, postcode, and phone |
| United Kingdom | `en_GB` / `fakerEN_GB` | Same common methods, including name, street address, city, administrative area, postcode, and phone |
| Japan | `ja` / `fakerJA` | `person.fullName`, `location.streetAddress`, `city`, `state`, `zipCode`, `phone.number`, and `internet.email` |
| South Korea | `ko` / `fakerKO` | Same common methods, including name, street address, city, administrative area, postcode, and phone |

The current docs explicitly say that not all methods are localized in all locales and that some locales have limited coverage or use English fallback data. For this tool, verify every field actually shown and avoid silently using English fallback when the selected region promises native-language values. The locale pages are evidence of available methods, not evidence that every generated full address corresponds to a deliverable property.

Faker's locale selector affects generated values and its API is documented one locale at a time. It does not document a paired English translation/romanization feature. If “local language and English” means bilingual **field labels**, implement those in the UI's message catalog. If it means bilingual **values**, scope the requirement field by field: English-script rendering of Korean/Chinese names and addresses needs explicit romanization/transliteration rules, and translating an address into a second display form should not be assumed to preserve a site's postal validation behavior.

Sources: [Chinese locale](https://fakerjs.dev/locales/zh_cn), [US locale](https://fakerjs.dev/locales/en_us), [UK locale](https://fakerjs.dev/locales/en_gb), [Japanese locale](https://fakerjs.dev/locales/ja), [Korean locale](https://fakerjs.dev/locales/ko), [localization and fallback behavior](https://fakerjs.dev/guide/localization), [localized address API](https://fakerjs.dev/api/location), [phone-number API](https://fakerjs.dev/api/phone.html).

## Published phone-number examples and gaps

| Region | Published source | What is documented | Suitability |
| --- | --- | --- | --- |
| United States | [NANPA 555 line numbers](https://www.nanpa.com/numbering/555-line-numbers) | `555-0100` through `555-0199` remain reserved as fictitious, non-working entertainment/advertising numbers. | Best documented fictional-number option found for US format examples. A number-plan library can check formatting; individual sites may still reject reserved values. |
| United Kingdom | [Ofcom numbers for TV/radio drama](https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama) | Ofcom lists mobile `07700 900000`–`07700 900999`, plus geographic and service ranges. It says these drama numbers cannot be allocated to customers and will not be allocated in the foreseeable future. | Strong documented option for UK examples. The ranges are intended for drama/public examples, not SMS verification. |
| Japan | [Ministry of Internal Affairs and Communications (MIC) number assignment status](https://www.soumu.go.jp/main_sosiki/joho_tsusin/top/tel_number/number_shitei.html) | The official assignment information lists service-number ranges assigned to telecom operators; related official data describes voice mobile ranges such as 070/080/090. I found no general fictional or non-working phone range in the sources checked. | Do not claim a generated Japanese mobile-shaped value is guaranteed fictional or safe to contact. |
| South Korea | [Korean Film Council (KOFIC) service notice](https://www.kofic.or.kr/kofic/business/noti/findNewsDetail.do?seqNo=49459) | KOFIC says it leases six numbers and provides them free to applicants making films for theatrical release, including two mobile numbers. The notice does not publish their exact digits. | Not an unrestricted test range or generator pool. Do not invent values from secondary-source block descriptions or imply the public can use them for registration. |
| Mainland China | [MIIT 2025 number-protection service pilot](https://www.miit.gov.cn/jgsj/xgj/wjfb/art/2025/art_ec866a5d25304fcf8c82382c88dd68c2.html) | MIIT describes the 700 code as a dedicated resource for licensed/applying number-protection services that relay calls/messages between real and temporary numbers. The notice says the service code must not be used to register/bind internet applications. | This is a real privacy-relay service resource, not a public fictional placeholder. I found no official general-purpose unassigned mobile range in the sources checked. Treat generated CN mobile-shaped values as potentially assigned unless another authoritative reservation is found. |

These sources illustrate an important product limit: a locally valid phone shape is not evidence that the value is fictitious, unassigned, or safe to contact. For unsupported regions, label a number as “format-shaped; may overlap a real number,” or omit the field. Do not claim it is guaranteed nonexistent.

## Cards, bank details, and other safer fixtures

- Faker has `creditCardNumber()`, `creditCardCVV()`, `accountNumber()`, and related methods. Its docs describe these as generated/random values; they do not identify them as network/provider test fixtures or claim they cannot collide with values accepted by live payment sites. See [Faker finance API](https://fakerjs.dev/api/finance.html).
- Stripe publishes card values for test scenarios, and its docs instruct developers to use test API keys for every test-card API call. Those numbers simulate payment behavior in Stripe's sandbox; they are not universal test cards for arbitrary payment providers or live websites. See [Stripe testing documentation](https://docs.stripe.com/testing).
- For email examples, the IETF reserves `example.com`, `example.net`, and `example.org` for examples; `.example` and `.invalid` are also reserved for example/invalid-name use. See [RFC 2606](https://www.rfc-editor.org/info/rfc2606/) and its update [RFC 6761](https://www.rfc-editor.org/info/rfc6761/). The product requirement is to use a non-deliverable reserved domain such as `.invalid`, rather than a real mail domain.

## Implementation implications and unresolved product scope

1. Use Faker for localized field content, and keep the selected country/locale as one profile-level choice. Add field-level checks to catch missing locale data and internally mismatched address parts; a format-only generator must not imply postal deliverability.
2. Use `libphonenumber-js` only to parse/format/check phone-number shape. It does not establish ownership or reachability; that is inferred from its role and documented API. Pin/update its metadata intentionally because numbering plans change.
3. Prefer reserved demonstration/test ranges where regulators publish them (currently US/UK found). For China, Japan, and South Korea, generated phone values should be explicitly format-only with a collision caveat unless an authoritative public test range is confirmed.
4. Keep payment-card fixtures in a separate, clearly marked “for your own payment sandbox” area if they are included at all. Do not mix provider-specific values with profiles meant for arbitrary third-party forms.
5. The initial field scope is now set to name, birth date, address, postal code, email, and phone. Payment-card data, bank-account details, and government identifiers are outside this initial profile. Library availability alone is not a product-scope recommendation.
