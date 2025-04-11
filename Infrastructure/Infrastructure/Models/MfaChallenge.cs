using System;
using System.Collections.Generic;
using System.Net;

namespace Infrastructure.Infrastructure.Models;

/// <summary>
/// auth: stores metadata about challenge requests made
/// </summary>
public partial class MfaChallenge
{
    public Guid Id { get; set; }

    public Guid FactorId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? VerifiedAt { get; set; }

    public IPAddress IpAddress { get; set; } = null!;

    public string? OtpCode { get; set; }

    public string? WebAuthnSessionData { get; set; }

    public virtual MfaFactor Factor { get; set; } = null!;
}
