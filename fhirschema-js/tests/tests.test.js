import { describe, expect, test } from "bun:test";
import {
  validate,
  enumerateElements,
  validateElementValue,
} from "../src/index.js";
import _ from "lodash";

// Validation test cases.
const validationCases = [
  require("../../tests/1_elements.json"),
  require("../../tests/2_base.json"),
  require("../../tests/3_choices.json"),
  require("../../tests/4_required.json"),
  require("../../tests/5_slices.json"),
  require("../../tests/6_extensions.json"),
  require("../../tests/7_bundles.json"),
];

// Element enumeration test cases.
const enumerationCases = [require("../../tests/8_enumeration.json")];

// Element value validation test cases.
const elementValidationCases = [
  require("../../tests/9_element_validation.json"),
];

// Run validation tests.
validationCases.forEach((tcase) => {
  let resolver = (url) => {
    return tcase.schemas[url];
  };
  let ctx = { schemaResolver: resolver };
  let desc = tcase.desc;
  describe(desc, () => {
    tcase.tests.forEach((tst) => {
      let run = tcase.focus ? tst.focus : true;
      if (!run) return;
      if (tst.skip) return;
      test(tst.desc || JSON.stringify(tst.data), () => {
        let res = validate(ctx, tst.schemas || [], tst.data);
        if (tst.errors) {
          expect(res.errors).toEqual(tst.errors);
        } else {
          expect(res.errors).toEqual([]);
        }
      });
    });
  });
});

// Run element enumeration tests.
enumerationCases.forEach((tcase) => {
  let resolver = (url) => {
    return tcase.schemas[url];
  };
  let ctx = { schemaResolver: resolver };
  let desc = tcase.desc;
  describe(desc, () => {
    tcase.tests.forEach((tst) => {
      if (tst.skip) return;
      test(tst.desc, () => {
        let res = enumerateElements(ctx, tst.schemas);
        if (tst.expected) {
          expect(res).toEqual(tst.expected);
        } else if (tst.expectedPartial) {
          // Check that the result contains all keys from expectedPartial with matching values.
          Object.keys(tst.expectedPartial).forEach((key) => {
            expect(res[key]).toBeDefined();
            expect(_.isMatch(res[key], tst.expectedPartial[key])).toBe(true);
          });
        }
      });
    });
  });
});

// Run element value validation tests.
elementValidationCases.forEach((tcase) => {
  let resolver = (url) => {
    return tcase.schemas[url];
  };
  let ctx = { schemaResolver: resolver };
  let desc = tcase.desc;
  describe(desc, () => {
    tcase.tests.forEach((tst) => {
      if (tst.skip) return;
      test(tst.desc, () => {
        let res = validateElementValue(ctx, tst.schemas, tst.path, tst.value);
        expect(res.errors).toEqual(tst.errors);
      });
    });
  });
});
