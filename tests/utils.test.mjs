import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deadlineView,
  expiryRefundState,
  remainingText,
  budget,
  errorMessage,
  eth,
  matchesFilter,
  percent,
  positiveEth,
  safeUrl,
  shortAddress,
} from "../src/utils.js";

describe("deadline display", () => {
  test("counts down to seconds and waits for an on-chain cutoff", () => {
    assert.deepEqual(deadlineView(100n, true, 99), { secondsLeft: 1, state: "open" });
    assert.equal(remainingText(1), "1s");
    assert.equal(remainingText(59), "59s");
    assert.equal(remainingText(60), "1m");
    assert.deepEqual(deadlineView(100n, true, 100), { secondsLeft: 0, state: "confirming" });
    assert.deepEqual(deadlineView(100n, true, 120), { secondsLeft: 0, state: "confirming" });
  });

  test("shows a closed window as soon as the snapshot says it is closed", () => {
    assert.equal(deadlineView(100n, false, 99).state, "closed");
    assert.equal(deadlineView(100n, false, 100).state, "closed");
  });
});

describe("expiryRefundState", () => {
  test("uses each unrefunded backer's on-chain quote after the first claim", () => {
    assert.equal(expiryRefundState(60n, false, 36n, true), "claimable");
    assert.equal(expiryRefundState(60n, true, 0n, true), null);
    assert.equal(expiryRefundState(43n, false, 25n, true), "claimable");
    assert.equal(expiryRefundState(0n, false, 0n, true), null);
  });

  test("distinguishes a pending window, an unavailable quote and a zero share", () => {
    assert.equal(expiryRefundState(1n, false, 0n, false), null);
    assert.equal(expiryRefundState(1n, false, null, true), "unavailable");
    assert.equal(expiryRefundState(1n, false, 0n, true), "rounds-to-zero");
  });
});

// Every case here runs on plain values: no network, no clock, no .env.local.
const ADDRESS = "0x9b824CA674432B390E30A5164a76c04EeAa8f686";
const ETHER = 10n ** 18n;

const project = (overrides = {}) => ({
  creator: ADDRESS,
  contribution: 0n,
  status: 0n,
  submitted: false,
  approved: false,
  approvedNow: false,
  ...overrides,
});

describe("shortAddress", () => {
  test("keeps the first six and last four characters", () => {
    assert.equal(shortAddress(ADDRESS), "0x9b82…f686");
  });

  test("returns an empty string for missing values", () => {
    assert.equal(shortAddress(""), "");
    assert.equal(shortAddress(null), "");
    assert.equal(shortAddress(undefined), "");
  });

  test("keeps its current shape for inputs shorter than the window", () => {
    // Pinning existing behaviour: both slices overlap on short input.
    assert.equal(shortAddress("0x12"), "0x12…0x12");
  });
});

describe("eth", () => {
  test("formats whole and fractional ether without float drift", () => {
    assert.equal(eth(0n), "0.0");
    assert.equal(eth(ETHER), "1.0");
    assert.equal(eth(ETHER * 1234n + ETHER / 2n), "1234.5");
  });

  test("renders the 40/60 payout amounts exactly", () => {
    assert.equal(eth((10n ** 16n * 4n) / 10n), "0.004");
    assert.equal(eth((10n ** 16n * 6n) / 10n), "0.006");
  });

  test("falls back to zero when the value is missing", () => {
    assert.equal(eth(undefined), "0.0");
    assert.equal(eth(null), "0.0");
  });
});

describe("percent", () => {
  test("returns zero when there is nothing to compare against", () => {
    assert.equal(percent(0n, 0n), 0);
    assert.equal(percent(10n, 0n), 0);
  });

  test("rounds down to two decimals after bigint division", () => {
    assert.equal(percent(1n, 3n), 33.33);
    assert.equal(percent(2n, 3n), 66.66);
    assert.equal(percent(1n, 10000n), 0.01);
  });

  test("keeps exact values exact", () => {
    assert.equal(percent(0n, 100n), 0);
    assert.equal(percent(50n, 100n), 50);
    assert.equal(percent(100n, 100n), 100);
  });

  test("allows overshoot above 100 for overfunded projects", () => {
    assert.equal(percent(150n, 100n), 150);
  });
});

describe("budget", () => {
  test("splits 40/60 for a clean total", () => {
    assert.equal(budget(100n, 0), 40n);
    assert.equal(budget(100n, 1), 60n);
  });

  test("keeps the remainder in stage two when 40% does not divide evenly", () => {
    assert.equal(budget(7n, 0), 2n);
    assert.equal(budget(7n, 1), 5n);
  });

  test("never loses or invents a wei", () => {
    for (const total of [1n, 2n, 3n, 7n, 99n, 100n, 12345n, 10n ** 18n + 1n]) {
      assert.equal(
        budget(total, 0) + budget(total, 1),
        total,
        `budget split must add up for ${total}`,
      );
    }
  });

  test("handles the smallest possible escrow", () => {
    assert.equal(budget(1n, 0), 0n);
    assert.equal(budget(1n, 1), 1n);
  });
});

describe("positiveEth", () => {
  test("parses valid amounts into wei", () => {
    assert.equal(positiveEth("0.01"), 10n ** 16n);
    assert.equal(positiveEth("1"), ETHER);
    assert.equal(positiveEth("1.5"), ETHER + ETHER / 2n);
    assert.equal(positiveEth("1.123456789012345678"), 1123456789012345678n);
  });

  test("rejects zero after parsing", () => {
    assert.throws(() => positiveEth("0"), /greater than zero/);
    assert.throws(() => positiveEth("0.000"), /greater than zero/);
    assert.throws(() => positiveEth("0.0"), /greater than zero/);
  });

  test("rejects anything that is not a plain decimal", () => {
    const invalid = ["-1", "1e5", ".5", "1.", " 1", "1 ", "1,5", "abc", "", "1.1234567890123456789"];
    for (const value of invalid) {
      assert.throws(
        () => positiveEth(value),
        /at most 18 decimal places/,
        `expected ${JSON.stringify(value)} to be rejected`,
      );
    }
  });
});

describe("safeUrl", () => {
  test("accepts http and https links", () => {
    assert.equal(safeUrl("https://example.com"), "https://example.com/");
    assert.equal(safeUrl("http://example.com/a"), "http://example.com/a");
  });

  test("keeps path, query and hash intact", () => {
    assert.equal(
      safeUrl("https://example.com/repo?tab=readme#top"),
      "https://example.com/repo?tab=readme#top",
    );
  });

  test("normalises scheme and host case", () => {
    assert.equal(safeUrl("HTTPS://Example.COM/Path"), "https://example.com/Path");
  });

  test("rejects non-http schemes and malformed input", () => {
    assert.equal(safeUrl("javascript:alert(1)"), null);
    assert.equal(safeUrl("ftp://example.com"), null);
    assert.equal(safeUrl("data:text/html,hi"), null);
    assert.equal(safeUrl("not a url"), null);
    assert.equal(safeUrl(""), null);
  });
});

describe("matchesFilter", () => {
  test("shows everything for the default filter", () => {
    assert.equal(matchesFilter("all", project(), ADDRESS), true);
    assert.equal(matchesFilter(undefined, project(), null), true);
  });

  test("mine compares the creator case-insensitively", () => {
    assert.equal(matchesFilter("mine", project(), ADDRESS), true);
    assert.equal(matchesFilter("mine", project(), ADDRESS.toLowerCase()), true);
    assert.equal(matchesFilter("mine", project(), "0x0000000000000000000000000000000000000001"), false);
    assert.equal(matchesFilter("mine", project(), ""), false);
    assert.equal(matchesFilter("mine", project(), null), false);
  });

  test("backed requires a non-zero contribution", () => {
    assert.equal(matchesFilter("backed", project({ contribution: 1n }), null), true);
    assert.equal(matchesFilter("backed", project({ contribution: 0n }), null), false);
    assert.equal(matchesFilter("backed", project({ contribution: undefined }), null), false);
  });

  test("review needs an open, unapproved milestone the user backed", () => {
    const ready = project({ status: 1n, submitted: true, contribution: 5n });
    assert.equal(matchesFilter("review", ready, null), true);
    assert.equal(matchesFilter("review", { ...ready, reviewOpen: false }, null), false);

    assert.equal(matchesFilter("review", project({ status: 1n, submitted: true, contribution: 5n, approved: true }), null), false);
    assert.equal(matchesFilter("review", project({ status: 1n, submitted: true, contribution: 5n, approvedNow: true }), null), false);
    assert.equal(matchesFilter("review", project({ status: 1n, submitted: false, contribution: 5n }), null), false);
    assert.equal(matchesFilter("review", project({ status: 1n, submitted: true, contribution: 0n }), null), false);
    assert.equal(matchesFilter("review", project({ status: 0n, submitted: true, contribution: 5n }), null), false);
    assert.equal(matchesFilter("review", project({ status: 2n, submitted: true, contribution: 5n }), null), false);
  });
});

describe("errorMessage", () => {
  const rejected = /rejected in MetaMask/;
  const cases = [
    ["code 4001", { code: 4001 }, rejected],
    ["ACTION_REJECTED", { code: "ACTION_REJECTED" }, rejected],
    ["nested 4001", { info: { error: { code: 4001 } } }, rejected],
    ["insufficient funds", { code: "INSUFFICIENT_FUNDS" }, /Insufficient Sepolia ETH/],
    ["unknown chain", { code: 4902 }, /Enable Sepolia/],
    ["nested unknown chain", { info: { error: { code: 4902 } } }, /Enable Sepolia/],
    ["network error", { code: "NETWORK_ERROR" }, /Network request failed/],
    ["server error", { code: "SERVER_ERROR" }, /Network request failed/],
    ["timeout", { code: "TIMEOUT" }, /Network request failed/],
    ["reason wins", { reason: "reason-text", shortMessage: "short", message: "plain" }, /^reason-text$/],
    ["shortMessage next", { shortMessage: "short-text", message: "plain" }, /^short-text$/],
    ["nested message next", { info: { error: { message: "nested-text" } }, message: "plain" }, /^nested-text$/],
    ["plain message last", { message: "plain-text" }, /^plain-text$/],
  ];

  for (const [name, error, expected] of cases) {
    test(`maps ${name}`, () => {
      assert.match(errorMessage(error), expected);
    });
  }

  test("falls back to a generic message", () => {
    const fallback = "Request failed. Please try again.";
    assert.equal(errorMessage({}), fallback);
    assert.equal(errorMessage(null), fallback);
    assert.equal(errorMessage(undefined), fallback);
  });

  test("survives an ethers-style nested rejection", () => {
    const error = { code: "CALL_EXCEPTION", info: { error: { code: 4001, message: "denied" } } };
    assert.match(errorMessage(error), rejected);
  });
});
