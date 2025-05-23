﻿using Domain.Entities;
using CsvHelper;
using System.Globalization;
using Application.Interfaces.DAL;
using Application.Interfaces;
using Application.CsvMaps;
using System.Formats.Asn1;

namespace Application.Services
{
    public class DataLoaderService : IDataLoaderService
    {
        private readonly IDashboardDal _dal;
        public DataLoaderService(IDashboardDal dal) => _dal = dal;

        public async Task<int> ImportAsync(string key, Stream csv)
        {
            using var reader = new StreamReader(csv);
            using var csvRdr = new CsvReader(reader, CultureInfo.InvariantCulture);

            switch (key.ToLowerInvariant())
            {
                case "interview":
                    csvRdr.Context.RegisterClassMap<InterviewMap>();
                    var interviews = csvRdr.GetRecords<Interview>().ToList();
                    await _dal.BulkInsertAsync(interviews);
                    return interviews.Count;

                case "ap":
                    csvRdr.Context.RegisterClassMap<ApReportMap>();
                    var aps = csvRdr.GetRecords<AccountsPayable>().ToList();
                    await _dal.BulkInsertAsync(aps);
                    return aps.Count;

                case "onboarding":
                    var ons = csvRdr.GetRecords<Onboarding>().ToList();
                    await _dal.BulkInsertAsync(ons);
                    return ons.Count;

                case "todo":
                    csvRdr.Context.RegisterClassMap<TodoTaskMap>();
                    var todos = csvRdr.GetRecords<TodoTask>().ToList();
                    await _dal.BulkInsertAsync(todos);
                    return todos.Count;

                default:
                    throw new ArgumentException("Unknown table key");
            }
        }
    }
}
