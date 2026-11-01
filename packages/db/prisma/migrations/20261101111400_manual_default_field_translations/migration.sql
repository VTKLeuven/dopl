-- D-143: the three fields every form starts with (`defaultFormFields`) get their
-- Dutch words, so an embed that asks for ?lang=nl reads Dutch without an admin
-- typing them first. Only where the English words are still the defaults: a
-- field that was renamed or reworded keeps no translation, because ours would
-- no longer say the same thing. A field that already has one is left alone.
UPDATE "intake_form_fields"
SET "translations" = '{"nl":{"label":"Samenvatting","helpText":null,"placeholder":"Waarmee kunnen we helpen?"}}'::jsonb
WHERE "key" = 'summary'
  AND "label" = 'Summary'
  AND "helpText" IS NULL
  AND "placeholder" = 'What do you need help with?'
  AND "translations" = '{}'::jsonb;

UPDATE "intake_form_fields"
SET "translations" = '{"nl":{"label":"Details","helpText":"Hoe je het probleem krijgt, foutmeldingen, wat je had verwacht.","placeholder":null}}'::jsonb
WHERE "key" = 'details'
  AND "label" = 'Details'
  AND "helpText" = 'Steps to reproduce, error messages, what you expected to happen.'
  AND "placeholder" IS NULL
  AND "translations" = '{}'::jsonb;

UPDATE "intake_form_fields"
SET "translations" = '{"nl":{"label":"Screenshots of bestanden","helpText":null,"placeholder":null}}'::jsonb
WHERE "key" = 'attachments'
  AND "label" = 'Screenshots or files'
  AND "helpText" IS NULL
  AND "placeholder" IS NULL
  AND "translations" = '{}'::jsonb;
