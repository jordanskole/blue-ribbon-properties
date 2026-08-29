import { describe, it, expect } from "vitest";
import { polygonCentroid } from "../../../src/counties/shared/township-lookup.js";

describe("polygonCentroid", () => {
  it("matches DuckDB's ST_Centroid for the Iosco target parcel's ring", () => {
    // Verified live against DuckDB ST_Y(ST_Centroid(...))/ST_X(ST_Centroid(...))
    // for the same ring, post-reprojection.
    const ring: [number, number][] = [
      [-83.43396303570957, 44.4396825950131],
      [-83.43610488884151, 44.439693306162795],
      [-83.4361026430533, 44.44150763113336],
      [-83.43395432205132, 44.44149736927274],
      [-83.43395513053508, 44.44132182704021],
      [-83.43396303570957, 44.4396825950131],
    ];
    const [lng, lat] = polygonCentroid(ring);
    expect(lng).toBeCloseTo(-83.43503116505623, 5);
    expect(lat).toBeCloseTo(44.44059568290728, 5);
  });

  it("matches the Roscommon target parcel's known centroid", () => {
    // Verified live -- this centroid resolves to "Roscommon Township" via
    // the statewide MinorCivilDivision layer, correctly disambiguating a
    // real duplicate-ID bug in Roscommon's own Township layer.
    const ring: [number, number][] = [
      [-84.775504233674, 44.3280463336908],
      [-84.7755129036588, 44.3281802630799],
      [-84.7750613139315, 44.3281813328021],
      [-84.7750604027277, 44.328162963954],
      [-84.7750566910371, 44.328102653675],
      [-84.7750530742179, 44.3280474666252],
      [-84.775504233674, 44.3280463336908],
    ];
    const [lng, lat] = polygonCentroid(ring);
    expect(lng).toBeCloseTo(-84.7752308036865, 5);
    expect(lat).toBeCloseTo(44.328086574854844, 5);
  });
});
