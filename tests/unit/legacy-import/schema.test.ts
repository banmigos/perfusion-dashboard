import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legacyCaptureSchema } from "../../../scripts/legacy-import/schema";

describe("legacyCaptureSchema", () => {
  it("accepts the real seed/legacy/2025-26-aistudio.json file", () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "seed/legacy/2025-26-aistudio.json"),
        "utf-8",
      ),
    );
    const result = legacyCaptureSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.records).toHaveLength(23);
      expect(result.data.record_count).toBe(23);
    }
  });

  it("rejects a record missing a required raw field", () => {
    const bad = {
      format: "legacy-capture/v1",
      captured_at: "2026-08-25",
      origin: {
        app: "x",
        repo: "x",
        commit: "x",
        file: "x",
        exported_symbol: "x",
      },
      import_policy: {
        verification: "draft",
        locked: false,
        claim_state: "x",
        checked_at: null,
        rationale: "x",
      },
      known_issues: [],
      record_count: 1,
      records: [
        {
          raw: {
            name: "Test University",
            city: "Testville, TS",
            degree: "MS",
            deadline: "Jan 1",
            gpa: 3.0,
            gre: "No",
            tuition: 50000,
            classSize: 10,
            lat: 0,
            lng: 0,
            // url intentionally missing
            prereqs: ["Bio"],
          },
          triage: [],
        },
      ],
    };
    const result = legacyCaptureSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "seed/legacy/2025-26-aistudio.json"),
        "utf-8",
      ),
    );
    const withExtra = { ...raw, unexpected_field: true };
    const result = legacyCaptureSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });
});
