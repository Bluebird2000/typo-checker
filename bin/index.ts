#!/usr/bin/env node
import runChecker from '../lib/checker'

const projectRoot = process.cwd();

runChecker(projectRoot);
