const crypto = require("crypto");
const {
  base64UrlDecode,
  base64UrlEncode
} = require("./cryptoUtils");
const {
  getActiveKey,
  getActiveKeyVersion,
  getKeyForVersion,
  isCurrentVersion,
  normalizeVersion
} = require("./keyManager");

const ENCRYPTION_PREFIX = "enc:gcm256";
const IV_LENGTH = 12;

const isEncrypted = (value) =>
  typeof value === "string" && value.startsWith(`${ENCRYPTION_PREFIX}:`);

const encodeEnvelope = ({ version, iv, tag, ciphertext }) =>
  [
    ENCRYPTION_PREFIX,
    normalizeVersion(version),
    base64UrlEncode(iv),
    base64UrlEncode(tag),
    base64UrlEncode(ciphertext)
  ].join(":");

const parseEnvelope = (value) => {
  if (!isEncrypted(value)) return null;

  const [, , version, iv, tag, ciphertext] = value.split(":");
  if (!version || !iv || !tag || !ciphertext) return null;

  return {
    version: normalizeVersion(version),
    iv: base64UrlDecode(iv),
    tag: base64UrlDecode(tag),
    ciphertext: base64UrlDecode(ciphertext)
  };
};

const encryptString = (plainText, { aad = "" } = {}) => {
  if (plainText === undefined || plainText === null || plainText === "") {
    return plainText;
  }

  const value = String(plainText);
  if (isEncrypted(value)) {
    if (!needsRotation(value)) {
      return value;
    }

    return encryptString(decryptString(value, { aad }), { aad });
  }

  const { key, version } = getActiveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(String(aad)));
  }

  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return encodeEnvelope({ version, iv, tag, ciphertext });
};

const decryptString = (encryptedValue, { aad = "" } = {}) => {
  if (encryptedValue === undefined || encryptedValue === null || encryptedValue === "") {
    return encryptedValue;
  }

  if (!isEncrypted(encryptedValue)) {
    return encryptedValue;
  }

  const envelope = parseEnvelope(encryptedValue);
  if (!envelope) {
    throw new Error("Encrypted value is malformed");
  }

  const { key } = getKeyForVersion(envelope.version);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, envelope.iv);
  if (aad) {
    decipher.setAAD(Buffer.from(String(aad)));
  }
  decipher.setAuthTag(envelope.tag);

  const plainText = Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final()
  ]);
  return plainText.toString("utf8");
};

const encryptJson = (value, options = {}) => {
  if (value === undefined || value === null) return value;
  return encryptString(JSON.stringify(value), options);
};

const decryptJson = (value, options = {}) => {
  if (value === undefined || value === null || value === "") return value;
  const decrypted = decryptString(value, options);
  if (decrypted === value && !isEncrypted(value)) return value;

  try {
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
};

function needsRotation(value) {
  const envelope = parseEnvelope(value);
  return Boolean(envelope && !isCurrentVersion(envelope.version));
}

const transformPath = (target, segments, transform) => {
  if (!target || segments.length === 0) return false;

  if (Array.isArray(target)) {
    return target
      .map((item) => transformPath(item, segments, transform))
      .some(Boolean);
  }

  const [current, ...rest] = segments;
  if (!Object.prototype.hasOwnProperty.call(target, current)) return false;

  if (rest.length === 0) {
    const nextValue = transform(target[current]);
    if (nextValue !== target[current]) {
      target[current] = nextValue;
      return true;
    }
    return false;
  }

  return transformPath(target[current], rest, transform);
};

const transformDocumentField = (doc, field, transform) => {
  const pathSegments = field.path.split(".");

  if (pathSegments.length === 1) {
    const currentValue = typeof doc.get === "function" ? doc.get(field.path) : doc[field.path];
    const nextValue = transform(currentValue, field);
    if (nextValue !== currentValue) {
      if (typeof doc.set === "function") {
        doc.set(field.path, nextValue);
      } else {
        doc[field.path] = nextValue;
      }
    }
    return;
  }

  const rootPath = pathSegments[0];
  const rootValue = typeof doc.get === "function" ? doc.get(rootPath) : doc[rootPath];
  const changed = transformPath(rootValue, pathSegments.slice(1), (value) => transform(value, field));

  if (changed && typeof doc.markModified === "function") {
    doc.markModified(rootPath);
  }
};

const normalizeField = (field) => {
  if (typeof field === "string") {
    return { path: field, type: "string" };
  }

  return {
    type: "string",
    ...field
  };
};

const transformDocumentFields = (doc, fields, mode) => {
  fields.forEach((field) => {
    transformDocumentField(doc, field, (value) => {
      if (value === undefined || value === null || value === "") return value;
      const aad = field.aad || field.path;

      if (field.type === "json") {
        return mode === "encrypt"
          ? encryptJson(value, { aad })
          : decryptJson(value, { aad });
      }

      return mode === "encrypt"
        ? encryptString(value, { aad })
        : decryptString(value, { aad });
    });
  });
};

const encryptUpdateDocument = (update, fields) => {
  if (!update || typeof update !== "object") return;

  const apply = (target) => {
    fields.forEach((field) => {
      transformPath(target, field.path.split("."), (value) => {
        if (value === undefined || value === null || value === "") return value;
        return field.type === "json"
          ? encryptJson(value, { aad: field.aad || field.path })
          : encryptString(value, { aad: field.aad || field.path });
      });
    });
  };

  if (update.$set) apply(update.$set);
  if (update.$setOnInsert) apply(update.$setOnInsert);

  const operatorKeys = Object.keys(update).filter((key) => key.startsWith("$"));
  if (operatorKeys.length === 0) {
    apply(update);
  }
};

const encryptedFieldsPlugin = (schema, options = {}) => {
  const fields = (options.fields || []).map(normalizeField);
  if (fields.length === 0) return;

  schema.pre("save", function encryptBeforeSave(next) {
    try {
      transformDocumentFields(this, fields, "encrypt");
      next();
    } catch (error) {
      next(error);
    }
  });

  schema.post("save", function decryptAfterSave(doc) {
    transformDocumentFields(doc, fields, "decrypt");
  });

  schema.post("init", function decryptAfterInit(doc) {
    transformDocumentFields(doc, fields, "decrypt");
  });

  ["findOneAndUpdate", "updateOne", "updateMany", "update"].forEach((hook) => {
    schema.pre(hook, function encryptBeforeUpdate(next) {
      try {
        encryptUpdateDocument(this.getUpdate(), fields);
        next();
      } catch (error) {
        next(error);
      }
    });
  });
};

module.exports = {
  ENCRYPTION_PREFIX,
  decryptJson,
  decryptString,
  encryptedFieldsPlugin,
  encryptJson,
  encryptString,
  isEncrypted,
  needsRotation,
  parseEnvelope,
  getActiveKeyVersion
};
