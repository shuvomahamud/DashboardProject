using System;

namespace Domain.Entities
{
	public class AccountsPayable
	{
		public int Id { get; set; }
		public string CandidateName { get; set; } // optional
		public string VendorName { get; set; }
		public string InvoiceNo { get; set; }
		public DateTime PaymentDueDate { get; set; }
	}
}
