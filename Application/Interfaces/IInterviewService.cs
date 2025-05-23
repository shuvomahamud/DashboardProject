﻿using Domain.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Application.Interfaces
{
    /// <summary>
    /// Contract for CRUD operations on Interview Information.
    /// </summary>
    public interface IInterviewService
    {
        /// <summary>
        /// Creates a new InterviewInformation record.
        /// </summary>
        /// <param name="interview">The interview data to create.</param>
        /// <returns>The created InterviewInformation object.</returns>
        Task<Interview> CreateAsync(Interview interview);

        /// <summary>
        /// Retrieves an InterviewInformation record by ID.
        /// </summary>
        /// <param name="id">The identifier of the interview record.</param>
        /// <returns>The InterviewInformation record, or null if not found.</returns>
        Task<Interview> GetByIdAsync(int id);

        /// <summary>
        /// Retrieves all InterviewInformation records.
        /// </summary>
        /// <returns>A list of InterviewInformation records.</returns>
        Task<IEnumerable<Interview>> GetAllAsync();

        /// <summary>
        /// Updates an existing InterviewInformation record.
        /// </summary>
        /// <param name="interview">The updated InterviewInformation object.</param>
        /// <returns>A boolean indicating success.</returns>
        Task<bool> UpdateAsync(Interview interview);

        /// <summary>
        /// Deletes an InterviewInformation record by ID.
        /// </summary>
        /// <param name="id">The identifier of the record to delete.</param>
        /// <returns>A boolean indicating success.</returns>
        Task<bool> DeleteAsync(int id);
    }
}
