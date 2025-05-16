using System.IO;
using System.Threading.Tasks;
using Application.DTOs;

namespace Application.Interfaces      // new root namespace
{
    public interface IDataLoaderService
    {
        Task<int> ImportAsync(string tableKey, Stream csvStream);
    }
}
