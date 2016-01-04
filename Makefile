test:
	mocha --require tests/mocha-config tests/test.js

check-lint:
	eslint `git ls-files . | grep '[.]js$$'`

check: check-lint test

.PHONY: test check check-lint
