import { describe, expect, it } from "vitest";
import type { ProgramDetail } from "@/domain/programs";
import { buildProgramRow } from "@/lib/programRows";

// Tuition rows are whole-record facts: the import writes one claim with
// field_key "record" per row, and the table must look it up under that key.
function detailWith(claims: ProgramDetail["claims"]): ProgramDetail {
  return {
    school: { slug: "s", name: "S", city: null, state: null },
    program: {
      id: 1,
      slug: "p",
      name: "P",
      credential: null,
      programLengthMonths: null,
    },
    cycles: [],
    tuitionEstimates: [
      {
        id: 7,
        residency: "flat",
        covers: "total_program",
        amountCents: 3200000,
        asOfYear: 2026,
      },
    ],
    claims,
  } as unknown as ProgramDetail;
}

describe("buildProgramRow tuition", () => {
  it("attaches the whole-record claim to the tuition cell", () => {
    const claim = {
      state: "known",
      verification: "verified",
      checkedAt: new Date("2026-10-15"),
      quote: null,
      source: null,
    };
    const row = buildProgramRow(
      detailWith(new Map([["tuition_estimates:7:record", claim]]) as never),
    );
    expect(row.tuition).toHaveLength(1);
    expect(row.tuition[0]!.value).toBe("$32,000");
    expect(row.tuition[0]!.claim).toBe(claim);
  });

  it("leaves the claim undefined when no record claim exists", () => {
    const row = buildProgramRow(detailWith(new Map()));
    expect(row.tuition[0]!.claim).toBeUndefined();
  });
});
