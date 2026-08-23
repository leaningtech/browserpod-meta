/**
 * Mission types: the contract between a mission file and the runner.
 *
 * A mission is a JSON file (checked into the worktree, or fetched from a URL)
 * that tells the bay what to do with a repository:
 *
 *   - `clone`   the repo to work on (git, shallow)
 *   - `locks`   lanes the job may touch (readme, src/, docs/) — paths are
 *               matched with `pathToRegexp`-style globs; `**` matches any
 *               depth. Anything not in `locks` is off-limits to writes.
 *   - `steps`   bash lines run through the gate, in order
 *   - `signals` a way to pass data between the step's stdout and a later
 *               step's stdin, using `@step:N@` placeholders
 *
 * Every `steps` entry runs inside the sandbox with `cwd` = the clone root.
 * The gate refuses any step whose command contains a write to a path
 * outside `locks`, and refuses steps that mutate git metadata
 * (`.git` / `.jj` are always locked out).
 */

export interface Lock {
	/** Path prefix, relative to the repo root. `**` matches any depth. */
	prefix: string;
	/** Optional comment shown in the UI, e.g. "src/ — source files". */
	note?: string;
}

export interface Step {
	/** A bash line. Runs through `/bin/bash -lc` with the pod env. */
	run: string;
	/** Human-readable label for the UI (e.g. "install deps"). */
	label?: string;
	/** If set, the step's stdout is captured and stored under this key. */
	store?: string;
}

export interface CloneSpec {
	/** The URL to clone. */
	url: string;
	/** Optional ref (branch/tag/commit) to check out. */
	ref?: string;
}

export interface Mission {
	/** Human-readable name, shown in the header. */
	name: string;
	/** One-line description. */
	description?: string;
	/** Repo to clone into the sandbox. */
	clone: CloneSpec;
	/**
	 * Lanes the agent may WRITE to. Paths are relative to the repo root,
	 * `**` matches any depth. Anything else is write-blocked by the gate.
	 * Example: ["src/**", "docs/**"]
	 */
	locks: string[];
	/** Steps executed in order, each through the gate. */
	steps: Step[];
	/** Where to write the verdict log. Default: `agent-bay/verdicts.md`. */
	verdictPath?: string;
	/** Optional mission display color (hex, no #). */
	accent?: string;
}
