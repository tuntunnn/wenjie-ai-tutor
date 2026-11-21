import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons,lookup,matches} from './tutor.mjs';
for(const l of lessons)test('年级 '+l.grade+' · '+l.title,()=>{
 assert.equal(lookup(l.problem),l);
 for(const [q,a,h1,h2] of l.steps){
 assert.ok(q&&h1&&h2);for(const alias of a.split('|'))assert.ok(matches(alias,a));
 assert.ok(!matches('不知道',a));assert.ok(!matches('直接告诉我答案',a));
 }
});
test('变式、负号与越界题面',()=>{
 assert.deepEqual(lookup('2x−4=10').steps.map(s=>s[1]),['4','14','7']);
 assert.ok(matches('x＝７','7'));assert.ok(!matches('我觉得不是7','7'));
 assert.equal(lookup('求证两直线垂直'),null);assert.equal(lookup('0x+2=3'),null);
});
