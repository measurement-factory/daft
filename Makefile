BIN=./node_modules/.bin

test:
	./src/cli/daft.js run tests/self.js

check-lint:
	$(BIN)/eslint `git ls-files . | grep '[.]js$$'`

check: check-lint test

.PHONY: test check check-lint
