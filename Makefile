test:
	mocha --compilers js:babel/register tests/*.js

.PHONY: test
