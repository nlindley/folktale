@annotate: folktale.data.maybe
---

A data structure that models the presence or abscence of a value.


## Example::

    const Maybe = require('folktale/data/maybe');
    
    const find = (list, predicate) => {
      for (var i = 0; i < list.length; ++i) {
        const item = list[i];
        if (predicate(item)) {
          return Maybe.Just(item);
        }
      }
      return Maybe.Nothing();
    };
    
    find([1, 2, 3], (x) => x > 2); // => Maybe.Just(3)
    find([1, 2, 3], (x) => x > 3); // => Maybe.Nothing()
    
    
## Why use Maybe?

Some functions can always return a sensible result for all arguments that
they're given. For example, the `successor` function on natural numbers can
always give back a valid result, regardless of which natural number we give it.
These functions are easier to understand because their results are more
predictable, and we don't have to worry about errors.

Not all functions have this property (of being *total*), though. Functions like
“find an item in this list” or “look up this key in that hashtable” don't always
have an answer, and so one has to think about how they deal with the cases where
the answer not being there. We have to be able to provide *some* kind of answer
to the programmer, as otherwise the program can't continue — that is, not
providing an answer is the equivalent of throwing an exception.

In most languages, things like “find an item in this list” will return `null`
(or the equivalent “not an object”) when the item can't be found, but what if
you had a `null` in th list? In others, you can only ask the question “find me
the index of this item in that list”, and when one index can't be found it
answers `-1`, assuming a 0-based indexed structure. But, again, what if I have
an indexed structure where `-1` is a valid index?

Really these questions *require* two answers: “is the item there?”, and if so,
“what is the item?”, and we often need to test for those answers separately.
Maybe is a data structure that helps answering these questions. A Maybe
structure has two cases:

  - `Just(value)` — represents the presence of an answer, and what the answer
    is.
  - `Nothing()` — represents the absence of an answer.
  
If we have maybe, we can change our code from::

    const find1 = (list, predicate) => {
      for (var i = 0; i < list.length; ++i) {
        const item = list[i];
        if (predicate(item)) {
          return item;
        }
      }
      return null;
    };
    
    find1([1, 2, 3], (x) => x > 2); // => 3
    find1([1, 2, 3], (x) => x > 3); // => null
    
To:

    const Maybe = require('folktale/data/maybe');

    const find1 = (list, predicate) => {
      for (var i = 0; i < list.length; ++i) {
        const item = list[i];
        if (predicate(item)) {
          return Maybe.Just(item);
        }
      }
      return Maybe.Nothing();
    };
    
    find1([1, 2, 3], (x) => x > 2); // => Maybe.Just(item)
    find1([1, 2, 3], (x) => x > 3); // => Maybe.Nothing()
    

