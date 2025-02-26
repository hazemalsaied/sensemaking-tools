// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as tf from "@tensorflow/tfjs-core";
import { communityNotesMatrixFactorization, Rating } from "./matrix_factorization";

// Mock console.log to avoid cluttering the test output
const originalConsoleLog = console.log;
beforeEach(() => {
  console.log = jest.fn();
});
afterEach(() => {
  console.log = originalConsoleLog;
});

describe("Matrix Factorization Tests", () => {
  it("should perform matrix factorization and return note helpfulness scores", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 0.5 },
      { userId: 1, noteId: 0, rating: 0.0 },
      { userId: 1, noteId: 2, rating: 1.0 },
      { userId: 2, noteId: 1, rating: 1.0 },
      { userId: 2, noteId: 2, rating: 0.5 },
      { userId: 3, noteId: 0, rating: 0.0 },
      { userId: 3, noteId: 1, rating: 0.0 },
      { userId: 3, noteId: 2, rating: 0.0 },
    ];
    const numNotes = 3;

    const helpfulnessScores = await communityNotesMatrixFactorization(ratings);

    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);
    helpfulnessScores.forEach((score) => {
      expect(typeof score).toBe("number");
    });
  });

  it("should handle different numbers of factors", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 0.5 },
      { userId: 1, noteId: 0, rating: 0.0 },
      { userId: 1, noteId: 2, rating: 1.0 },
      { userId: 2, noteId: 1, rating: 1.0 },
      { userId: 2, noteId: 2, rating: 0.5 },
      { userId: 3, noteId: 0, rating: 0.0 },
      { userId: 3, noteId: 1, rating: 0.0 },
      { userId: 3, noteId: 2, rating: 0.0 },
    ];
    const numNotes = 3;

    const helpfulnessScores2 = await communityNotesMatrixFactorization(
      ratings,
      2
    );
    const helpfulnessScores3 = await communityNotesMatrixFactorization(
      ratings,
      3
    );

    expect(helpfulnessScores2).toBeInstanceOf(Array);
    expect(helpfulnessScores2.length).toBe(numNotes);

    expect(helpfulnessScores3).toBeInstanceOf(Array);
    expect(helpfulnessScores3.length).toBe(numNotes);
  });

  it("should handle different numbers of epochs", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 0.5 },
      { userId: 1, noteId: 0, rating: 0.0 },
    ];
    const numNotes = 2;
    const numFactors = 1;

    const numEpocs = 33;

    // Mock out the minimize function so we can count how many times it gets called
    const mockMinimize = jest.fn();
    /* eslint-disable-next-line  @typescript-eslint/no-explicit-any */
    jest.spyOn(tf.train, "adam").mockReturnValue({ minimize: mockMinimize } as any);
    const helpfulnessScores = await communityNotesMatrixFactorization(
      ratings,
      numFactors,
      numEpocs
    );
    // Check how many times it was called
    expect(mockMinimize).toHaveBeenCalledTimes(numEpocs);
    // Check that we're still getting an array, etc out (this could be more
    // meaningful if our mock was also doing the normal job of minimize)
    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);
    jest.restoreAllMocks();
  });

  it("should handle all notes having identical ratings", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 1, noteId: 0, rating: 1.0 },
      { userId: 2, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 1.0 },
      { userId: 1, noteId: 1, rating: 1.0 },
      { userId: 2, noteId: 1, rating: 1.0 },
      { userId: 0, noteId: 2, rating: 1.0 },
      { userId: 1, noteId: 2, rating: 1.0 },
      { userId: 2, noteId: 2, rating: 1.0 },
    ];
    const numNotes = 3;

    const helpfulnessScores = await communityNotesMatrixFactorization(
      ratings,
    );
    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);
    helpfulnessScores.forEach((score) => {
      expect(typeof score).toBe("number");
    });
  });


  it("should be okay to have a skipped userId", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 1, noteId: 0, rating: 1.0 },
      { userId: 3, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 1.0 },
      { userId: 1, noteId: 1, rating: 1.0 },
      { userId: 3, noteId: 1, rating: 1.0 },
      { userId: 0, noteId: 2, rating: 1.0 },
      { userId: 1, noteId: 2, rating: 1.0 },
      { userId: 3, noteId: 2, rating: 1.0 },
    ];
    const numNotes = 3;

    const helpfulnessScores = await communityNotesMatrixFactorization(
      ratings,
    );
    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);
    helpfulnessScores.forEach((score) => {
      expect(typeof score).toBe("number");
    });
  });


  it("should be okay to have a skipped noteId", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 1, noteId: 0, rating: 1.0 },
      { userId: 2, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 1.0 },
      { userId: 1, noteId: 1, rating: 1.0 },
      { userId: 2, noteId: 1, rating: 1.0 },
      { userId: 0, noteId: 3, rating: 1.0 },
      { userId: 1, noteId: 3, rating: 1.0 },
      { userId: 2, noteId: 3, rating: 1.0 },
    ];
    const numNotes = 4;

    const helpfulnessScores = await communityNotesMatrixFactorization(
      ratings,
    );
    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);
    helpfulnessScores.forEach((score) => {
      expect(typeof score).toBe("number");
    });
  });

  it("should be okay to have skipped noteId and userIds", async () => {
    const ratings: Rating[] = [
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 1, noteId: 0, rating: 1.0 },
      { userId: 3, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 1, rating: 1.0 },
      { userId: 1, noteId: 1, rating: 1.0 },
      { userId: 3, noteId: 1, rating: 1.0 },
      { userId: 0, noteId: 3, rating: 1.0 },
      { userId: 1, noteId: 3, rating: 1.0 },
      { userId: 3, noteId: 3, rating: 1.0 },
    ];
    const numNotes = 4;

    const helpfulnessScores = await communityNotesMatrixFactorization(
      ratings,
    );
    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);
    helpfulnessScores.forEach((score) => {
      expect(typeof score).toBe("number");
    });
  });

  it("should pick the most helpful note", async () => {
    // Here, users 0-2 align with notes 0-2, users 3-5 align with notes 3-5,
    // and notes 6-7 are generally helpful
    const ratings: Rating[] = [
      // group 1:
      { userId: 0, noteId: 0, rating: 1.0 },
      { userId: 0, noteId: 2, rating: 1.0 },
      { userId: 0, noteId: 3, rating: 0.0 },
      { userId: 0, noteId: 4, rating: 0.0 },
      { userId: 0, noteId: 5, rating: 0.0 },
      { userId: 0, noteId: 6, rating: 1.0 },
      { userId: 0, noteId: 7, rating: 1.0 },

      { userId: 1, noteId: 0, rating: 1.0 },
      { userId: 1, noteId: 1, rating: 1.0 },
      { userId: 1, noteId: 2, rating: 1.0 },
      { userId: 1, noteId: 3, rating: 0.0 },
      { userId: 1, noteId: 4, rating: 0.0 },
      { userId: 1, noteId: 5, rating: 0.0 },
      { userId: 1, noteId: 6, rating: 1.0 },
      { userId: 1, noteId: 7, rating: 1.0 },

      { userId: 2, noteId: 0, rating: 1.0 },
      { userId: 2, noteId: 1, rating: 1.0 },
      { userId: 2, noteId: 2, rating: 1.0 },
      { userId: 2, noteId: 3, rating: 0.0 },
      { userId: 2, noteId: 4, rating: 0.0 },
      { userId: 2, noteId: 5, rating: 0.0 },
      { userId: 2, noteId: 6, rating: 0.5 },
      { userId: 2, noteId: 7, rating: 1.0 },

      // group 2:
      { userId: 3, noteId: 0, rating: 0.5 },
      { userId: 3, noteId: 2, rating: 0.0 },
      { userId: 3, noteId: 3, rating: 1.0 },
      { userId: 3, noteId: 4, rating: 1.0 },
      { userId: 3, noteId: 5, rating: 1.0 },
      { userId: 3, noteId: 6, rating: 1.0 },
      { userId: 3, noteId: 7, rating: 1.0 },

      { userId: 4, noteId: 0, rating: 0.0 },
      { userId: 4, noteId: 1, rating: 0.0 },
      { userId: 4, noteId: 2, rating: 0.0 },
      { userId: 4, noteId: 3, rating: 1.0 },
      { userId: 4, noteId: 4, rating: 1.0 },
      { userId: 4, noteId: 5, rating: 1.0 },
      { userId: 4, noteId: 6, rating: 1.0 },
      { userId: 4, noteId: 7, rating: 1.0 },

      { userId: 5, noteId: 0, rating: 0.0 },
      { userId: 5, noteId: 1, rating: 0.0 },
      { userId: 5, noteId: 2, rating: 0.0 },
      { userId: 5, noteId: 3, rating: 1.0 },
      { userId: 5, noteId: 4, rating: 1.0 },
      { userId: 5, noteId: 5, rating: 1.0 },
      { userId: 5, noteId: 6, rating: 0.5 },
      { userId: 5, noteId: 7, rating: 1.0 },
    ];
    const numNotes = 8;
    const numFactors = 1;

    const helpfulnessScores = await communityNotesMatrixFactorization(
      ratings,
      numFactors
    );

    expect(helpfulnessScores).toBeInstanceOf(Array);
    expect(helpfulnessScores.length).toBe(numNotes);

    // sort nodeId values by their helpfulness scores, in descending order
    const sortedScores = helpfulnessScores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score);

    // Check that the most helpful notes are at the top
    expect(sortedScores[0].index).toBe(7);
    expect(sortedScores[1].index).toBe(6);

    helpfulnessScores.forEach((score) => {
      expect(typeof score).toBe("number");
    });
  });
});
